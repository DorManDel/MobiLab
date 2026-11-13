// FaceFX v0.6: geometry constraints to reduce uncanny deformation on a 2D source face.
// Pure math: does not inspect images, run AI, or send data anywhere.
const FACE_OVAL=new Set([10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]);
const FEATURES=new Set([0,1,2,4,5,6,12,13,14,15,16,17,18,19,33,37,38,39,40,41,42,46,47,48,50,52,53,55,61,62,63,64,65,66,67,70,78,80,81,82,84,87,88,91,95,98,105,107,133,144,145,153,157,158,159,160,168,173,185,191,195,197,199,205,207,209,214,263,267,276,282,291,292,293,295,296,300,306,308,310,311,312,314,317,318,321,327,334,336,362,373,374,380,384,385,386,387,398,399,402,405,409,415,417,425]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function stabilizeWarpPoints(source,target,expression=.45){
  if(source.length!==target.length||source.length<468)return target;
  const a=source[33],b=source[263],c=target[33],d=target[263];
  const sx=b.x-a.x,sy=b.y-a.y,tx=d.x-c.x,ty=d.y-c.y;
  const size=sx*sx+sy*sy;
  if(!Number.isFinite(size)||size<1e-6)return target;
  const cosScale=(tx*sx+ty*sy)/size;
  const sinScale=(ty*sx-tx*sy)/size;
  const smx=(a.x+b.x)/2,smy=(a.y+b.y)/2;
  const tmx=(c.x+d.x)/2,tmy=(c.y+d.y)/2;
  const strength=clamp(Number(expression)||0,0,1);
  return target.map((t,i)=>{
    if(FACE_OVAL.has(i))return t; // Never move face silhouette away from target.
    const src=source[i],dx=src.x-smx,dy=src.y-smy;
    const baseX=tmx+cosScale*dx-sinScale*dy;
    const baseY=tmy+sinScale*dx+cosScale*dy;
    // Facial feature positions are anchored more strongly to the source identity.
    const follow=FEATURES.has(i)?(.30+.65*strength):(.55+.40*strength);
    return {x:baseX*(1-follow)+t.x*follow,y:baseY*(1-follow)+t.y*follow};
  });
}
export function estimateProfileVisibility(points){
  if(!points||!points[1]||!points[33]||!points[263])return 1;
  const a=points[33],b=points[263],nose=points[1];
  const vx=b.x-a.x,vy=b.y-a.y,len2=vx*vx+vy*vy;
  if(len2<1e-7)return 1;
  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  // Angle proxy, not a 3D head-pose estimate.
  const deviation=Math.abs(((nose.x-mx)*vx+(nose.y-my)*vy)/len2);
  return clamp(1-Math.max(0,deviation-.23)/.33,.24,1);
}
