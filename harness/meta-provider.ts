// Meta Muse transport for blind discovery (stateless HTTPS Messages API, built-in fetch).
// Sends only the system string and ONE user message (the discovery prompt). No tools field.
// Returns the concatenated text blocks plus a sanitized public record. Raw response bodies are
// returned separately for PRIVATE storage only; headers and the API key are never returned.
//
// Docs: https://dev.meta.ai/docs/protocols/messages
export const META_ENDPOINT = "https://api.meta.ai/v1/messages";
export const META_KEY_ENV = "MODEL_API_KEY";

export interface MetaConfig {
  model: string;
  maxTokens: number;
  /** null disables the thinking/output_config fields entirely */
  effort: "low" | "medium" | "high" | null;
  timeoutMs: number;
  maxRetries: number;
}

export interface MetaReply {
  ok: boolean;
  text?: string;
  failure?: string;
  /** safe to publish: provider, response model, stop reason, numeric usage, attempts */
  result: Record<string, unknown>;
  /** private only: one entry per attempt (status + raw body text or error) */
  rawAttempts: { attempt: number; status: number | null; body: string }[];
}

export function metaRequestShape(cfg: MetaConfig) {
  return {
    endpoint: META_ENDPOINT,
    api: "messages",
    auth: `Bearer token from ${META_KEY_ENV} environment variable (never recorded)`,
    body: {
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      stream: true,
      system: "<SYSTEM_PROMPT from harness/prompt-template.md>",
      messages: "[{ role: user, content: <round prompt> }]",
      ...(cfg.effort ? { thinking: { type: "adaptive" }, output_config: { effort: cfg.effort } } : {}),
      tools: "omitted",
    },
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
    retryOn: "network error, timeout, HTTP 408/409/429/5xx (never 4xx auth/validation)",
  };
}

const RETRYABLE = (s: number) => s === 408 || s === 409 || s === 429 || s >= 500;

function numericUsage(u: unknown): Record<string, number> | undefined {
  if (!u || typeof u !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(u as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (v && typeof v === "object") {
      for (const [nested, value] of Object.entries(numericUsage(v) ?? {})) out[`${k}.${nested}`] = value;
    }
  }
  return out;
}

export async function callMeta(
  system: string,
  prompt: string,
  cfg: MetaConfig,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaReply> {
  const scrub = (s: string) => (apiKey ? s.split(apiKey).join("<redacted>") : s);
  const body = JSON.stringify({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    stream: true,
    system,
    messages: [{ role: "user", content: prompt }],
    ...(cfg.effort ? { thinking: { type: "adaptive" }, output_config: { effort: cfg.effort } } : {}),
  });
  const rawAttempts: MetaReply["rawAttempts"] = [];
  const result: Record<string, unknown> = { provider: "meta", requestedModel: cfg.model };
  let lastErr = "";
  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    result.attempts = attempt;
    let status: number | null = null;
    let text = "";
    let isStream = false;
    try {
      const res = await fetchImpl(META_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      status = res.status;
      isStream = res.headers.get("content-type")?.includes("text/event-stream") ?? false;
      text = await res.text();
    } catch (e) {
      const cause = (e as Error & { cause?: { code?: string; name?: string; message?: string } }).cause;
      const detail = [cause?.code, cause?.name, cause?.message?.slice(0, 200)].filter(Boolean).join(": ");
      lastErr = scrub(`${(e as Error).name}: ${(e as Error).message}${detail ? ` (${detail})` : ""}`);
      rawAttempts.push({ attempt, status, body: lastErr });
      if (attempt <= cfg.maxRetries) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
      continue;
    }
    rawAttempts.push({ attempt, status, body: scrub(text) });
    result.httpStatus = status;
    if (status < 200 || status >= 300) {
      lastErr = `HTTP ${status}: ${scrub(text).slice(0, 300)}`;
      if (RETRYABLE(status) && attempt <= cfg.maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        continue;
      }
      return { ok: false, failure: `meta call failed: ${lastErr}`, result, rawAttempts };
    }
    let msg: Record<string, unknown>;
    try {
      msg = isStream ? parseMetaStream(text) : JSON.parse(text);
    } catch (error) {
      if (error instanceof MetaStreamError && error.retryable && attempt <= cfg.maxRetries) {
        lastErr = error.message;
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        continue;
      }
      return { ok: false, failure: error instanceof MetaStreamError ? error.message : "meta call failed: response body is incomplete or invalid", result, rawAttempts };
    }
    result.model = msg.model;
    result.stop_reason = msg.stop_reason;
    result.usage = numericUsage(msg.usage);
    const content = Array.isArray(msg.content) ? (msg.content as Record<string, unknown>[]) : [];
    result.content_block_types = content.map((b) => String(b?.type));
    const toolUses = content.filter((b) => b?.type === "tool_use" || b?.type === "server_tool_use").length;
    result.tool_use_events = toolUses;
    const out = content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text as string).join("");
    const fail = (why: string) => ({ ok: false, failure: `meta reply rejected: ${why}`, result, rawAttempts });
    if (toolUses) return fail(`${toolUses} tool call block(s); tools were not offered`);
    if (msg.stop_reason === "refusal") return fail("refusal");
    if (msg.stop_reason === "max_tokens") return fail(`truncated at max_tokens=${cfg.maxTokens}`);
    if (msg.stop_reason !== "end_turn" && msg.stop_reason !== "stop_sequence") return fail(`unexpected stop_reason ${JSON.stringify(msg.stop_reason)}`);
    if (!out.trim()) return fail("no text content");
    return { ok: true, text: out, result, rawAttempts };
  }
  return { ok: false, failure: `meta call failed after ${cfg.maxRetries + 1} attempts: ${lastErr}`, result, rawAttempts };
}

class MetaStreamError extends Error {
  readonly retryable: boolean;
  constructor(type: unknown) {
    const known = ["overloaded_error", "api_error", "rate_limit_error", "authentication_error", "invalid_request_error"].includes(String(type)) ? String(type) : "unknown_error";
    super(`Meta stream error: ${known}`);
    this.retryable = ["overloaded_error", "api_error", "rate_limit_error"].includes(known);
  }
}

/** Assemble the final message from Anthropic-compatible SSE. Never treat an interrupted stream as a reply. */
export function parseMetaStream(raw: string): Record<string, unknown> {
  let message: Record<string, unknown> | undefined;
  const blocks: Record<string, unknown>[] = [];
  let completed = false;
  for (const event of raw.replace(/\r\n/g, "\n").split("\n\n")) {
    const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    const item = JSON.parse(data);
    if (item.type === "error") throw new MetaStreamError(item.error?.type);
    if (item.type === "message_start") message = { ...item.message };
    if (item.type === "content_block_start") blocks[item.index] = { ...item.content_block };
    if (item.type === "content_block_delta" && item.delta?.type === "text_delta") {
      const block = blocks[item.index];
      if (!block || block.type !== "text") throw new Error("Text delta without a text block");
      block.text = String(block.text ?? "") + item.delta.text;
    }
    if (item.type === "message_delta" && message) {
      Object.assign(message, item.delta);
      message.usage = { ...numericUsage(message.usage), ...numericUsage(item.usage) };
    }
    if (item.type === "message_stop") completed = true;
  }
  if (!message || !completed) throw new Error("Incomplete Meta stream");
  return { ...message, content: blocks };
}
