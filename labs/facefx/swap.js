import { stabilizeWarpPoints, estimateProfileVisibility } from './warp-geometry.js';
// FaceFX mobile Photo Swap v0.3 — entirely on-device, no image uploads.
// 2D landmark-matched texture deformation; not a generative identity model.
// No third-party triangulation runtime needed: triangulate once when a source photo loads.
export const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const FACIAL_DETAILS = [1,2,4,5,6,19,33,61,62,70,78,80,81,82,84,87,88,91,95,98,105,107,133,144,145,153,157,158,159,160,168,173,185,191,195,197,199,205,207,209,214,263,267,276,282,291,292,293,295,296,300,306,308,310,311,312,314,317,318,321,327,334,336,362,373,374,380,384,385,386,387,398,399,402,405,409,415,417,425];
const MAX_PHOTO_SIDE = 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function pointInside(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
  }
  return inside;
}
function area(a,b,c){ return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function circumcircle(a,b,c) {
  const d = 2*(a.x*(b.y-c.y) + b.x*(c.y-a.y) + c.x*(a.y-b.y));
  if (Math.abs(d) < 1e-12) return null;
  const aa=a.x*a.x+a.y*a.y, bb=b.x*b.x+b.y*b.y, cc=c.x*c.x+c.y*c.y;
  const x=(aa*(b.y-c.y)+bb*(c.y-a.y)+cc*(a.y-b.y))/d;
  const y=(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d;
  return {x,y,r2:(x-a.x)**2+(y-a.y)**2};
}
function triangulate(points) {
  const n=points.length;
  const x0=Math.min(...points.map(p=>p.x)), y0=Math.min(...points.map(p=>p.y));
  const x1=Math.max(...points.map(p=>p.x)), y1=Math.max(...points.map(p=>p.y));
  const s=Math.max(x1-x0,y1-y0)||1, cx=(x0+x1)/2, cy=(y0+y1)/2;
  const all=[...points,{x:cx-30*s,y:cy-10*s},{x:cx,y:cy+30*s},{x:cx+30*s,y:cy-10*s}];
  let tris=[[n,n+1,n+2]];
  for(let k=0;k<n;k++){
    const boundaries=new Map();
    const keep=[];
    for(const tri of tris){
      const cc=circumcircle(all[tri[0]],all[tri[1]],all[tri[2]]);
      if(cc && (all[k].x-cc.x)**2+(all[k].y-cc.y)**2 <= cc.r2+1e-10){
        for(let i=0;i<3;i++){
          const u=tri[i],v=tri[(i+1)%3],key=Math.min(u,v)+','+Math.max(u,v);
          if(boundaries.has(key))boundaries.delete(key);
          else boundaries.set(key,[u,v]);
        }
      }else keep.push(tri);
    }
    for(const edge of boundaries.values()) keep.push([edge[0],edge[1],k]);
    tris=keep;
  }
  return tris.filter(t=>t.every(k=>k<n) && Math.abs(area(all[t[0]],all[t[1]],all[t[2]]))>1e-9);
}
function chooseLandmarks(sourcePoints) {
  const oval=FACE_OVAL.map(id=>sourcePoints[id]);
  if(oval.some(p=>!p))throw new Error('Face landmarks were incomplete. Choose a clear frontal photo.');
  const needed=new Set([...FACE_OVAL,...FACIAL_DETAILS]);
  for(let i=0;i<468;i+=14)needed.add(i);
  return [...needed].filter(id=>sourcePoints[id] && (FACE_OVAL.includes(id)||pointInside(sourcePoints[id],oval)));
}
function computeMesh(facePoints) {
  const ids=chooseLandmarks(facePoints);
  const points=ids.map(id=>({x:facePoints[id].x,y:facePoints[id].y}));
  const oval=FACE_OVAL.map(id=>facePoints[id]);
  const triangles=triangulate(points).filter(t=>{
    const c={x:(points[t[0]].x+points[t[1]].x+points[t[2]].x)/3,
             y:(points[t[0]].y+points[t[1]].y+points[t[2]].y)/3};
    return pointInside(c,oval);
  }).map(t=>t.map(i=>ids[i]));
  if(triangles.length<40)throw new Error('Could not construct a face mesh from this photo.');
  return triangles;
}
function transformTriangle(ctx,img,src,dst){
  const [a,b,c]=src, [d,e,f]=dst;
  const m1=b.x-a.x, m2=c.x-a.x, m3=b.y-a.y, m4=c.y-a.y;
  const det=m1*m4-m2*m3;
  if(Math.abs(det)<1e-4 || area(a,b,c)*area(d,e,f)<=0)return; // Do not fold triangles through themselves.
  const ux=e.x-d.x, vx=f.x-d.x, uy=e.y-d.y, vy=f.y-d.y;
  const ta=(ux*m4-vx*m3)/det, tc=(vx*m1-ux*m2)/det;
  const tb=(uy*m4-vy*m3)/det, td=(vy*m1-uy*m2)/det;
  const te=d.x-ta*a.x-tc*a.y, tf=d.y-tb*a.x-td*a.y;
  if(![ta,tb,tc,td,te,tf].every(Number.isFinite))return;
  // Expand the destination clipping triangle by 0.6 px to reduce seams.
  const mx=(d.x+e.x+f.x)/3,my=(d.y+e.y+f.y)/3;
  ctx.save();ctx.beginPath();
  for(const [i,p] of [d,e,f].entries()){
    const r=Math.hypot(p.x-mx,p.y-my)||1;
    const px=p.x+0.6*(p.x-mx)/r,py=p.y+0.6*(p.y-my)/r;
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }
  ctx.closePath();ctx.clip();
  ctx.transform(ta,tb,tc,td,te,tf);
  const x=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)-2));
  const y=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y)-2));
  const right=Math.min(img.width,Math.ceil(Math.max(a.x,b.x,c.x)+2));
  const bottom=Math.min(img.height,Math.ceil(Math.max(a.y,b.y,c.y)+2));
  if(right>x&&bottom>y) ctx.drawImage(img,x,y,right-x,bottom-y,x,y,right-x,bottom-y);
  ctx.restore();
}
function ovalMask(ctx,points,width,height,feather){
  ctx.save();ctx.globalCompositeOperation='destination-in';
  // Blur only the facial silhouette, keeping interior texture sharp.
  ctx.filter=`blur(${feather}px)`;
  ctx.beginPath();
  for(let i=0;i<FACE_OVAL.length;i++){
    const p=points[FACE_OVAL[i]],x=p.x*width,y=p.y*height;
    if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.restore();
}
export class LocalPhotoSwap {
  constructor(){this.photo=null;this.landmarks=null;this.triangles=[];this.buffer=document.createElement('canvas');this.visibility=1;}
  get ready(){return !!this.photo && this.triangles.length>0;}
  clear(){this.photo=null;this.landmarks=null;this.triangles=[];this.buffer.width=1;this.buffer.height=1;this.visibility=1;}
  async loadFile(file,detectImage){
    if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP face photo.');
    if(file.size>MAX_PHOTO_BYTES)throw new Error('Photo too large. Choose an image under 8 MB.');
    const decoded=await createImageBitmap(file);
    try{
      const ratio=Math.min(1,MAX_PHOTO_SIDE/Math.max(decoded.width,decoded.height));
      const img=document.createElement('canvas');
      img.width=Math.max(1,Math.round(decoded.width*ratio));
      img.height=Math.max(1,Math.round(decoded.height*ratio));
      img.getContext('2d').drawImage(decoded,0,0,img.width,img.height);
      const points=await detectImage(img);
      if(!points || points.length<468)throw new Error('No suitable face found in the source image. Use a clear single-face portrait.');
      const triangles=computeMesh(points);
      this.photo=img;this.landmarks=points.map(p=>({x:p.x,y:p.y,z:p.z}));this.triangles=triangles;
      return {triangles:triangles.length,photoWidth:img.width,photoHeight:img.height};
    }finally{decoded.close();}
  }
  render(points,width,height,quality=1,expression=.45){
    if(!this.ready||!points||points.length<468)return null;
    // Lower resolution may be used for battery-friendly rendering; canvas output is upscaled.
    const w=Math.max(1,Math.round(width*quality)),h=Math.max(1,Math.round(height*quality));
    if(this.buffer.width!==w||this.buffer.height!==h){this.buffer.width=w;this.buffer.height=h;}
    const ctx=this.buffer.getContext('2d',{alpha:true});ctx.clearRect(0,0,w,h);
    const source=this.landmarks.map(p=>({x:p.x*this.photo.width,y:p.y*this.photo.height}));
    const liveTarget=points.map(p=>({x:p.x*w,y:p.y*h}));
    const target=stabilizeWarpPoints(source,liveTarget,expression);
    this.visibility=estimateProfileVisibility(points);
    for(const tri of this.triangles){
      transformTriangle(ctx,this.photo,tri.map(i=>source[i]),tri.map(i=>target[i]));
    }
    const eyeDistance=Math.hypot(liveTarget[33].x-liveTarget[263].x,liveTarget[33].y-liveTarget[263].y);
    ovalMask(ctx,points,w,h,Math.max(3,eyeDistance*0.055));
    return this.buffer;
  }
}
