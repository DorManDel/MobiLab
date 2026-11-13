import test from "node:test";
import assert from "node:assert/strict";
import {World} from "./engine.mjs";
test("stable identity after swap-and-remove",()=>{
  const w=new World({capacity:5});
  const a=w.spawn({x:3}),b=w.spawn({x:4}),c=w.spawn({x:5});
  assert.equal(w.remove(b),true);
  assert.equal(w.count,2);assert.equal(w.indexOf(b),-1);
  assert.equal(w.snapshot(c).x,5);assert.equal(w.indexOf(c),1);
  assert.equal(w.remove(b),false);
  assert.ok(w.spawn()>c);
});
test("fixed-step integration is independent of render frames",()=>{
  const a=new World({capacity:2}),b=new World({capacity:2});
  a.spawn({x:100,y:100,z:100,vx:40,vy:0,vz:0});
  b.spawn({x:100,y:100,z:100,vx:40,vy:0,vz:0});
  for(let i=0;i<30;i++)a.integrate(1/30);
  for(let i=0;i<60;i++)b.integrate(1/60);
  assert.ok(Math.abs(a.x[0]-b.x[0])<0.002);
});
test("3D neighbors: grid agrees with exhaustive lookup",()=>{
  const w=new World({capacity:5});
  const a=w.spawn({x:100,y:100,z:100,vx:0,vy:0,vz:0});
  const b=w.spawn({x:110,y:100,z:100,vx:0,vy:0,vz:0});
  const c=w.spawn({x:110,y:100,z:800,vx:0,vy:0,vz:0});
  w.rebuildGrid(100);
  assert.deepEqual(w.neighbors(a,50).ids,[b]);
  assert.deepEqual(w.neighbors(a,50).ids,w.neighbors(a,50,"all").ids);
  assert.ok(!w.neighbors(a,50).ids.includes(c));
});
test("capacity and zero-based world ID lookup",()=>{
  const w=new World({capacity:1});assert.ok(w.spawn());assert.equal(w.spawn(),null);
});
