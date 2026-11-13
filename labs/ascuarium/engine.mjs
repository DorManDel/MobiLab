// ASCuarium M0 / educational runtime. No biological or scientific calibration claims.
export class World {
  constructor({capacity=1000, seed=42, width=10000, height=5000, depth=3000}={}) {
    this.capacity=capacity; this.count=0; this.nextId=1; this.seed=seed>>>0;
    this.bounds={width,height,depth}; this.byId=new Map();
    this.id=new Uint32Array(capacity); this.x=new Float32Array(capacity);
    this.y=new Float32Array(capacity); this.z=new Float32Array(capacity);
    this.vx=new Float32Array(capacity); this.vy=new Float32Array(capacity);
    this.vz=new Float32Array(capacity); this.radius=new Float32Array(capacity);
    this.energy=new Float32Array(capacity); this.state=new Uint8Array(capacity);
    this.grid=new Map(); this.cellSize=350; this.ticks=0;
  }
  random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
  spawn(options={}) {
    if(this.count>=this.capacity) return null;
    const i=this.count++,id=this.nextId++;
    this.id[i]=id;
    this.x[i]=options.x??this.random()*this.bounds.width;
    this.y[i]=options.y??this.random()*this.bounds.height;
    this.z[i]=options.z??this.random()*this.bounds.depth;
    this.vx[i]=options.vx??(this.random()-.5)*110;
    this.vy[i]=options.vy??(this.random()-.5)*65;
    this.vz[i]=options.vz??(this.random()-.5)*35;
    this.radius[i]=options.radius??25; this.energy[i]=options.energy??100;
    this.state[i]=options.state??0;this.byId.set(id,i);
    return id;
  }
  remove(id){
    const i=this.byId.get(id);
    if(i===undefined) return false;
    const last=this.count-1,moved=this.id[last];
    if(i!==last){
      for(const key of ["id","x","y","z","vx","vy","vz","radius","energy","state"])this[key][i]=this[key][last];
      this.byId.set(moved,i);
    }
    this.byId.delete(id);this.count--;return true;
  }
  indexOf(id){return this.byId.get(id)??-1;}
  integrate(dt){
    for(let i=0;i<this.count;i++){
      for(const [pos,vel,max] of [["x","vx",this.bounds.width],["y","vy",this.bounds.height],["z","vz",this.bounds.depth]]){
        let p=this[pos][i]+this[vel][i]*dt;
        if(p<0){p=-p;this[vel][i]=Math.abs(this[vel][i]);}
        if(p>max){p=2*max-p;this[vel][i]=-Math.abs(this[vel][i]);}
        this[pos][i]=Math.max(0,Math.min(max,p));
      }
    }
    this.ticks++;
  }
  key(cx,cy,cz){return cx+","+cy+","+cz;}
  rebuildGrid(cellSize=this.cellSize){
    this.cellSize=cellSize;this.grid.clear();
    for(let i=0;i<this.count;i++){
      const k=this.key(Math.floor(this.x[i]/cellSize),Math.floor(this.y[i]/cellSize),Math.floor(this.z[i]/cellSize));
      if(!this.grid.has(k))this.grid.set(k,[]);
      this.grid.get(k).push(i);
    }
  }
  neighbors(id,range,method="grid"){
    const i=this.indexOf(id);
    if(i<0)return {ids:[],checks:0};
    let candidates=[],checks=0;
    if(method==="all") candidates=Array.from({length:this.count},(_,j)=>j);
    else {
      const cell=this.cellSize,s=Math.ceil(range/cell);
      const a=Math.floor(this.x[i]/cell),b=Math.floor(this.y[i]/cell),c=Math.floor(this.z[i]/cell);
      for(let dx=-s;dx<=s;dx++)for(let dy=-s;dy<=s;dy++)for(let dz=-s;dz<=s;dz++){
        const members=this.grid.get(this.key(a+dx,b+dy,c+dz));
        if(members)candidates.push(...members);
      }
    }
    const result=[],r2=range*range;
    for(const j of candidates){if(i===j)continue;checks++;
      const dx=this.x[j]-this.x[i],dy=this.y[j]-this.y[i],dz=this.z[j]-this.z[i];
      if(dx*dx+dy*dy+dz*dz<=r2)result.push(this.id[j]);}
    return {ids:result,checks};
  }
  snapshot(id){const i=this.indexOf(id);return i<0?null:{id,x:this.x[i],y:this.y[i],z:this.z[i],energy:this.energy[i]};}
}
export function makeWorld(count=180,seed=42){
  const world=new World({capacity:1000,seed});
  for(let i=0;i<count;i++)world.spawn();
  world.rebuildGrid();return world;
}
