function simulate(layout, actions){
  const colMap={red:'r',green:'g',blue:'b',white:'w'};
  const dirs={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]};
  const wallSet=new Set((layout.walls||[]).map(o=>o.x+','+o.y));
  const lampList=(layout.lamps||[]).map(o=>({x:o.x,y:o.y,c:colMap[o.color],dx:dirs[o.dir][0],dy:dirs[o.dir][1]}));
  const lampSet=new Set((layout.lamps||[]).map(o=>o.x+','+o.y));
  const glassMap=new Map((layout.glass||[]).map(o=>[o.x+','+o.y,colMap[o.color]]));
  const sensorList=(layout.sensors||[]).map(o=>({id:o.id,x:o.x,y:o.y}));
  const doorList=(layout.doors||[]).map(o=>({id:o.id,x:o.x,y:o.y,c:colMap[o.color],sensor:o.sensor}));
  const doorPosMap=new Map(doorList.map((d,i)=>[d.x+','+d.y,i]));
  let px=layout.player.x, py=layout.player.y;
  let crates=(layout.crates||[]).map(o=>({id:o.id,x:o.x,y:o.y}));
  function compute(){
    const crateSet=new Set(crates.map(c=>c.x+','+c.y));
    const sets=[];
    for(let y=0;y<7;y++){sets.push([]);for(let x=0;x<7;x++)sets[y].push(new Set());}
    for(const L of lampList){
      let cur=L.c;
      let x=L.x+L.dx, y=L.y+L.dy;
      while(x>=0&&x<7&&y>=0&&y<7){
        const key=x+','+y;
        if(wallSet.has(key)||lampSet.has(key)) break;
        if(glassMap.has(key)){
          const g=glassMap.get(key);
          sets[y][x].add(g);
          cur=g;
          if(crateSet.has(key)) break;
        } else {
          sets[y][x].add(cur);
          if(crateSet.has(key)) break;
        }
        x+=L.dx; y+=L.dy;
      }
    }
    const light=[];
    for(let y=0;y<7;y++){const row=[];for(let x=0;x<7;x++){const a=[...sets[y][x]].sort();row.push(a.join(''));}light.push(row);}
    const sensorObs=sensorList.map(s=>({id:s.id,light:light[s.y][s.x]}));
    const byId=new Map(sensorObs.map(o=>[o.id,o.light]));
    const doorObs=doorList.map(d=>{const sl=byId.get(d.sensor)||'';return {id:d.id,open:sl.includes(d.c)};});
    const openByPos=new Map();
    doorList.forEach((d,i)=>openByPos.set(d.x+','+d.y,doorObs[i].open));
    const crateObs=crates.map(c=>({id:c.id,x:c.x,y:c.y,lit:light[c.y][c.x]!==''}));
    return {light,sensorObs,doorObs,crateObs,openByPos};
  }
  const res=[];
  let c0=compute();
  res.push({player:{x:px,y:py},crates:c0.crateObs,light:c0.light,sensors:c0.sensorObs,doors:c0.doorObs});
  for(const a of actions){
    const cur=compute();
    const dv=dirs[a];
    const nx=px+dv[0], ny=py+dv[1];
    if(nx>=0&&nx<7&&ny>=0&&ny<7){
      const nk=nx+','+ny;
      if(!wallSet.has(nk)&&!lampSet.has(nk)){
        const ci=crates.findIndex(cc=>cc.x===nx&&cc.y===ny);
        if(ci>=0){
          if(cur.crateObs[ci].lit){
            let tx=crates[ci].x, ty=crates[ci].y;
            while(true){
              const qx=tx+dv[0], qy=ty+dv[1];
              if(qx<0||qx>=7||qy<0||qy>=7) break;
              const qk=qx+','+qy;
              if(wallSet.has(qk)||lampSet.has(qk)) break;
              let other=false;
              for(let j=0;j<crates.length;j++) if(j!==ci&&crates[j].x===qx&&crates[j].y===qy){other=true;break;}
              if(other) break;
              if(doorPosMap.has(qk)&&!cur.openByPos.get(qk)) break;
              tx=qx; ty=qy;
            }
            if(tx!==crates[ci].x||ty!==crates[ci].y){
              crates[ci].x=tx; crates[ci].y=ty;
              if(!(doorPosMap.has(nk)&&!cur.openByPos.get(nk))){px=nx; py=ny;}
            }
          }
        } else {
          if(!(doorPosMap.has(nk)&&!cur.openByPos.get(nk))){px=nx; py=ny;}
        }
      }
    }
    const c2=compute();
    res.push({player:{x:px,y:py},crates:c2.crateObs,light:c2.light,sensors:c2.sensorObs,doors:c2.doorObs});
  }
  return res;
}