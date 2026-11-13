import assert from 'node:assert/strict';
import {detectPortrait,TrackingHealth} from './detection.js';

const points=Array.from({length:478},(_,i)=>({x:.25+i/2000,y:.35+i/2500,z:0}));
const direct=detectPortrait({detect:()=>({faceLandmarks:[points]})},{width:384,height:384});
assert.equal(direct.strategy,'original');
assert.equal(direct.landmarks.length,478);

let calls=0;
globalThis.document={createElement:()=>({
  width:1,height:1,
  getContext:()=>({fillRect(){},drawImage(){},set fillStyle(_) {}})
})};
const padded=detectPortrait({detect:()=>({faceLandmarks:(++calls===1)?[]:[points]})},{width:384,height:384});
assert.equal(padded.strategy,'padded-18');
assert.equal(padded.landmarks.length,478);
assert.ok(padded.landmarks[0].x<points[0].x);
assert.ok(padded.landmarks[0].y<points[0].y);
const missing=detectPortrait({detect:()=>({faceLandmarks:[]})},{width:384,height:384});
assert.equal(missing.strategy,'not-found');
assert.equal(missing.landmarks,null);

const health=new TrackingHealth();
assert.equal(health.progress(false),'WAITING FOR CAMERA');
for(let i=0;i<15;i++)health.accept(null,i*65);
assert.equal(health.shouldTryImageFallback(),true);
assert.equal(health.progress(true),'NO FACE DETECTED');
assert.equal(health.accept(points,1000),true);
assert.equal(health.misses,0);
assert.equal(health.progress(false),'FACE TRACKED / CHOOSE PHOTO');
assert.equal(health.progress(true),'TRACKING / READY TO SWAP');
console.log('FaceFX recovery unit tests passed.');
