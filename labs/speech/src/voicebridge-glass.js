/**
 * VoiceBridge optical surface: adapted from MobiLab/labs/liquid-fx/ v0.3.
 * SVG red/green displacement mapping, generated only when dock size changes.
 * Frosted CSS remains a fallback on browsers without SVG backdrop filters.
 */
const NS="http://www.w3.org/2000/svg";
const NUM=(v)=>Math.round(v*10)/10;
export function makeGlassMap(width,height,{radius=26,bezel=12}={}) {
  const w=Math.max(32,Math.round(width)),h=Math.max(32,Math.round(height));
  const b=Math.min(bezel,h/3),r=Math.min(radius,h/2);
  const iw=Math.max(1,w-2*b),ih=Math.max(1,h-2*b);
  return '<svg xmlns="'+NS+'" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+
  '<defs><linearGradient id="Y" x1="0" x2="0" y1="3%" y2="97%"><stop stop-color="#0f0"/><stop offset="1" stop-color="#000"/></linearGradient>'+
  '<linearGradient id="X" x1="2%" x2="98%" y1="0" y2="0"><stop stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient></defs>'+
  '<rect width="'+w+'" height="'+h+'" fill="#808080"/><g filter="blur(2px)">'+
  '<rect width="'+w+'" height="'+h+'" fill="#000080"/>'+
  '<rect width="'+w+'" height="'+h+'" fill="url(#Y)" style="mix-blend-mode:screen"/>'+
  '<rect width="'+w+'" height="'+h+'" fill="url(#X)" style="mix-blend-mode:screen"/>'+
  '<rect x="'+NUM(b)+'" y="'+NUM(b)+'" width="'+NUM(iw)+'" height="'+NUM(ih)+'" rx="'+NUM(Math.max(0,r-b))+'" fill="#808080" filter="blur('+NUM(b)+'px)"/></g></svg>';
}
export function makeGlassFilter(width,height,id="vb-optical-lens",refraction=80){
  const w=Math.round(width),h=Math.round(height);
  const map="data:image/svg+xml;utf8,"+encodeURIComponent(makeGlassMap(w,h));
  const channel=(n,matrix,name)=>'<feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="'+n+'" xChannelSelector="R" yChannelSelector="G"/>'+
    '<feColorMatrix type="matrix" result="'+name+'" values="'+matrix+'"/>';
  const R="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
  const G="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0";
  const B="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0";
  return '<svg xmlns="'+NS+'" width="0" height="0" style="position:absolute" aria-hidden="true">'+
    '<filter id="'+id+'" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'+
    '<feImage x="0" y="0" width="'+w+'" height="'+h+'" href="'+map+'" result="displacementMap"/>'+
    channel(refraction,R,"R")+channel(Math.max(0,refraction-2),G,"G")+channel(Math.max(0,refraction-4),B,"B")+
    '<feBlend in="R" in2="G" mode="screen" result="rg"/><feBlend in="rg" in2="B" mode="screen"/></filter></svg>';
}
export function setupGlassLens(shadowRoot,dock){
  const mount=document.createElement("div");
  mount.style.cssText="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  mount.setAttribute("aria-hidden","true");
  shadowRoot.append(mount);
  let enabled=false,frame=0,refraction=80;
  const update=()=>{
    if(!enabled)return;
    const box=dock.getBoundingClientRect(),w=Math.round(box.width),h=Math.round(box.height);
    if(w<40||h<30)return;
    mount.innerHTML=makeGlassFilter(w,h,"vb-optical-lens",refraction);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
  const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(schedule):null;
  observer?.observe(dock);
  return {
    enable(on){
      enabled=Boolean(on) && typeof CSS!=="undefined" &&
        CSS.supports("backdrop-filter","url(#vb-optical-lens)");
      dock.classList.toggle("optical",enabled);
      if(enabled)schedule();
      else{cancelAnimationFrame(frame);mount.replaceChildren();}
      return enabled;
    },
    setRefraction(value){refraction=Math.max(0,Math.min(280,Math.round(Number(value)||0)));schedule();},
    destroy(){observer?.disconnect();cancelAnimationFrame(frame);mount.remove();}
  };
}
