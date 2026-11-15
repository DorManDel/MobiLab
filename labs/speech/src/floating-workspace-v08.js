/**
 * VoiceBridge v0.8: three draggable display modes and scrollable history curtain.
 * UI-only; microphone/network work remains in the host Speech Lab.
 */
const KEY="mobilab.voicebridge.floating.v08";
const MODES=["bubble","floating","expanded"];
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const valid=(v)=>MODES.includes(v)?v:"floating";
function saved(){
  try {const x=JSON.parse(localStorage.getItem(KEY)||"{}");
    return {mode:valid(x.mode),x:Number.isFinite(x.x)?x.x:null,y:Number.isFinite(x.y)?x.y:null};
  } catch {return {mode:"floating",x:null,y:null};}
}
export function initializeFloatingWorkspace(host){
  const root=host.shadowRoot,$=id=>root.getElementById(id);
  if(root.getElementById("vbDrag"))return;
  const style=document.createElement("style");
  style.textContent="\n:host{display:block!important;position:fixed!important;left:var(--vb-left,auto)!important;top:var(--vb-top,auto)!important;right:var(--vb-right,14px)!important;bottom:var(--vb-bottom,max(16px,env(safe-area-inset-bottom)))!important;width:min(var(--vb-window-width,344px),calc(100vw - 24px))!important;z-index:100!important;color:#f6f1ff}\n:host([data-layout=\"bubble\"]){--vb-window-width:110px}\n:host([data-layout=\"floating\"]){--vb-window-width:310px}\n:host([data-layout=\"expanded\"]){--vb-window-width:390px}\n.vb-float-top{display:flex;align-items:center;justify-content:space-between;gap:3px;min-height:28px;padding:0 5px 2px;border-radius:12px 12px 0 0}\n.vb-grip{min-height:27px!important;border:1px solid #ffffff24!important;background:linear-gradient(110deg,#ffffff20,#1c244280)!important;color:#ddd2fb!important;font-size:10px!important;padding:3px 9px!important;flex:1;text-align:left;touch-action:none!important;cursor:grab;user-select:none}\n.vb-grip:active{cursor:grabbing}\n.vb-cycle{min-height:27px!important;min-width:30px!important;padding:3px 7px!important;border-radius:10px!important;background:#3a315ccc!important;font-size:11px!important}\n.bar{display:grid!important;grid-template-columns:78px minmax(0,1fr) 34px!important;grid-template-rows:44px 44px!important;gap:4px!important;align-items:stretch!important;padding:7px!important;overflow:visible!important;border-radius:21px!important}\n.bar #record{grid-column:1!important;grid-row:1/3!important;width:min(var(--mic-width,76px),76px)!important;height:87px!important;min-height:0!important;min-width:0!important;padding:5px!important;justify-self:stretch!important}\n.bar #captionShell{grid-column:2!important;grid-row:1/3!important;display:flex!important;flex-direction:column;justify-content:center;min-width:0;margin:0!important;padding:6px 7px!important;pointer-events:none;border-radius:14px!important;overflow:hidden}\n.bar #captionShell[hidden]{display:none!important}\n.caption-meta{font-size:9px!important;display:flex!important;flex-wrap:wrap;gap:3px!important}\n.caption-meta #captionStatus{max-width:100%!important}\n.caption-viewport{font-size:clamp(12px,3.4vw,15px)!important;max-height:calc(var(--floating-lines,2)*1.28em)!important;line-height:1.36;overflow:hidden;word-break:break-word}\n#historyToggle{grid-column:3!important;grid-row:1!important;min-width:0!important;padding:4px!important}\n#settings{grid-column:3!important;grid-row:2!important;min-width:0!important;padding:4px!important}\n#speak,#langs,#peek{display:none!important}\n:host([data-layout=\"bubble\"]) .vb-grip{font-size:0!important;padding:3px 6px!important}\n:host([data-layout=\"bubble\"]) .vb-grip:before{content:\"⠿\";font-size:14px}\n:host([data-layout=\"bubble\"]) .bar{display:flex!important;justify-content:center!important;padding:5px!important}\n:host([data-layout=\"bubble\"]) #captionShell,:host([data-layout=\"bubble\"]) #historyToggle,:host([data-layout=\"bubble\"]) #settings{display:none!important}\n:host([data-layout=\"bubble\"]) .bar #record{height:85px!important;width:90px!important}\n:host([data-layout=\"expanded\"]) .bar{grid-template-columns:102px minmax(0,1fr) 40px!important;grid-template-rows:50px 50px 44px!important}\n:host([data-layout=\"expanded\"]) .bar #record{grid-row:1/3!important;height:99px!important}\n:host([data-layout=\"expanded\"]) #captionShell{grid-row:1/3!important}\n:host([data-layout=\"expanded\"]) #speak{display:block!important;grid-column:1!important;grid-row:3!important}\n:host([data-layout=\"expanded\"]) #langs{display:block!important;grid-column:2!important;grid-row:3!important}\n:host([data-layout=\"expanded\"]) #settings{grid-column:3!important;grid-row:2/4!important}\n.vb-curtain-backdrop{position:fixed;inset:0;background:#0508179c;backdrop-filter:blur(5px);z-index:1}\n.vb-curtain-backdrop[hidden]{display:none!important}\n.history-sheet{position:fixed!important;left:0!important;right:0!important;bottom:0!important;z-index:2!important;\n width:100vw!important;max-width:none!important;min-height:160px;max-height:min(85dvh,770px)!important;\n height:var(--vb-sheet-height,65dvh)!important;margin:0!important;\n border-radius:25px 25px 0 0!important;padding-bottom:max(12px,env(safe-area-inset-bottom));\n box-shadow:0 -14px 65px #000b,inset 0 1px #ffffff44!important;\n background:linear-gradient(152deg,#14233aeF,#14132deF 58%,#071524fa)!important;\n animation:vbCurtainUp .3s cubic-bezier(.2,1.16,.4,1) both}\n.history-sheet[hidden]{display:none!important}\n.sheet-head{padding:7px 17px 10px!important}\n.sheet-list{padding:10px 16px 16px!important;overflow-y:auto;touch-action:pan-y}\n.history-item{font-size:13px!important;white-space:normal;min-height:65px!important}\n@keyframes vbCurtainUp{from{opacity:0;transform:translateY(25px)}to{opacity:1;transform:translateY(0)}}\n.panel{position:fixed!important;top:max(12px,env(safe-area-inset-top))!important;bottom:auto!important;\n left:max(10px,calc((100vw - 460px)/2))!important;right:auto!important;width:min(460px,calc(100vw - 20px))!important;\n max-height:calc(100dvh - 24px - env(safe-area-inset-top))!important;overflow-y:auto!important;z-index:3!important}\n.vb-mode-field{margin:9px 0;display:grid;gap:5px}\n.vb-mode-field label{font-size:11px!important}\n.vb-mode-field select{width:100%}\n@media(max-width:380px){.bar{grid-template-columns:72px minmax(0,1fr) 32px!important}}\n@media(min-width:741px){:host{--vb-window-width:360px;max-width:420px}}\n@media(prefers-reduced-motion:reduce){.history-sheet{animation:none!important}}\n\n/* Mobile mini VU and waveform always show ACTUAL microphone monitor signal. */\n.vb-signal{display:flex;align-items:center;gap:4px;margin-top:3px;height:26px;min-width:0;position:relative}\n.vb-wave{flex:1 1 0;width:1px;min-width:11px;height:17px;display:block}\n.vb-vu{width:51px;height:28px;min-width:51px;flex:none;border-radius:5px;overflow:hidden;border:1px solid #e1d4ae88;background:linear-gradient(145deg,#e2d5b5,#c6b28b);box-shadow:inset 0 1px 2px #fff9,0 1px 4px #0006}\n.vb-vu svg{width:100%;height:100%}\n.vb-vu-needle{transform-origin:60px 48px;transform-box:view-box;transform:rotate(-48deg);transition:transform .065s linear}\n.vb-signal-status{position:absolute;right:2px;bottom:-3px;font-size:6px;color:#e8d3ad;letter-spacing:.3px}\n@media(prefers-reduced-motion:reduce){.vb-vu-needle{transition:none!important}}\n";
  root.append(style);
  const header=document.createElement("div");
  header.className="vb-float-top";
  header.innerHTML='<button type="button" class="vb-grip" id="vbDrag" aria-label="Drag VoiceBridge window">⠿ Move window</button>'+
    '<button type="button" class="vb-cycle" id="vbCycle" aria-label="Change display mode">◉</button>';
  root.insertBefore(header,$("captionShell"));
  const bar=root.querySelector(".bar");
  bar.insertBefore($("captionShell"),$("historyToggle"));

  const signal=document.createElement("div");
  signal.className="vb-signal";signal.id="vbSignal";
  signal.setAttribute("aria-label","Microphone audio level. VU is not recognition confidence.");
  signal.innerHTML='<canvas id="vbWave" class="vb-wave" width="104" height="17" aria-hidden="true"></canvas>'+
    '<div class="vb-vu"><svg viewBox="0 0 120 60" role="img" aria-label="Miniature analog VU meter">'+
    '<path d="M14 45Q60 -16 106 45" fill="none" stroke="#7b6b55" stroke-width="2"/>'+
    '<path d="M22 37l-5 -5M41 19l-3 -7M60 12v-8M79 19l3 -7M98 37l5 -5" stroke="#50473f" stroke-width="2"/>'+
    '<text x="14" y="55" font-size="10" fill="#494139">-20</text>'+
    '<text x="50" y="10" font-size="10" fill="#494139">-3</text>'+
    '<text x="90" y="55" font-size="10" fill="#b34139">+3</text>'+
    '<line id="vbVuNeedle" class="vb-vu-needle" x1="60" y1="48" x2="60" y2="12" stroke="#312d2b" stroke-width="2.7"/>'+
    '<circle cx="60" cy="48" r="4" fill="#40352e"/></svg></div>'+
    '<span class="vb-signal-status" id="vbSignalStatus">AUDIO —</span>';
  $("captionShell").append(signal);

  const backdrop=document.createElement("div");
  backdrop.className="vb-curtain-backdrop";backdrop.id="vbCurtainBackdrop";backdrop.hidden=true;
  root.insertBefore(backdrop,header);
  backdrop.addEventListener("click",()=>host.toggleHistory(false));
  $("sheetClose").addEventListener("click",()=>$("vbCycle").focus());
  const modeField=document.createElement("div");modeField.className="vb-mode-field";
  modeField.innerHTML='<label for="vbLayout">Floating window style</label>'+
    '<select id="vbLayout"><option value="bubble">Bubble · smallest</option>'+
    '<option value="floating">Floating mic + live translation · default</option>'+
    '<option value="expanded">Expanded controls + translation</option></select>'+
    '<p>Drag using the Move handle. Open History to unfold the entire transcript.</p>';
  $("panel").insertBefore(modeField,$("panel").querySelector(".mic-tuner"));
  const state=saved();
  const viewport=()=>{
    const vv=window.visualViewport;
    return {w:vv?.width||window.innerWidth,h:vv?.height||window.innerHeight,
      x:vv?.offsetLeft||0,y:vv?.offsetTop||0};
  };
  let layout=state.mode,px=state.x,py=state.y,drag=null,raf=0;
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify({mode:layout,x:px,y:py}));}catch{}
  }
  function clampWindow(){
    const v=viewport();
    const width=host.offsetWidth||344,height=host.offsetHeight||155;
    if(px===null||py===null){
      px=Math.max(v.x+8,v.x+v.w-width-16);
      py=Math.max(v.y+8,v.y+v.h-height-18);
    }
    px=clamp(px,v.x+6,Math.max(v.x+6,v.x+v.w-width-6));
    py=clamp(py,v.y+6,Math.max(v.y+6,v.y+v.h-height-6));
    host.style.setProperty("--vb-left",px+"px");
    host.style.setProperty("--vb-top",py+"px");
    host.style.setProperty("--vb-right","auto");
    host.style.setProperty("--vb-bottom","auto");
  }
  function setMode(value){
    layout=valid(value);
    host.dataset.layout=layout;
    host.layoutMode=layout;
    $("vbLayout").value=layout;
    $("vbCycle").textContent=layout==="bubble"?"▢":layout==="floating"?"◉":"▣";
    $("vbCycle").title="Display: "+layout+" · tap to cycle";
    $("vbCycle").setAttribute("aria-label","Display "+layout+". Change mode");
    requestAnimationFrame(()=>{clampWindow();persist();});
  }
  host.setLayoutMode=setMode;
  $("vbLayout").addEventListener("change",e=>setMode(e.target.value));
  $("vbCycle").addEventListener("click",()=>setMode(MODES[(MODES.indexOf(layout)+1)%MODES.length]));
  $("vbDrag").addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse" && e.button!==0)return;
    drag={x:e.clientX,y:e.clientY,px,py};
    $("vbDrag").setPointerCapture(e.pointerId);
  });
  $("vbDrag").addEventListener("pointermove",e=>{
    if(!drag)return;
    px=drag.px+e.clientX-drag.x;
    py=drag.py+e.clientY-drag.y;
    cancelAnimationFrame(raf);raf=requestAnimationFrame(clampWindow);
  });
  const stopDrag=()=>{if(drag){drag=null;clampWindow();persist();}};
  $("vbDrag").addEventListener("pointerup",stopDrag);
  $("vbDrag").addEventListener("pointercancel",stopDrag);
  $("vbDrag").addEventListener("keydown",e=>{
    if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))return;
    e.preventDefault();
    px+=(e.key==="ArrowLeft"?-16:e.key==="ArrowRight"?16:0);
    py+=(e.key==="ArrowUp"?-16:e.key==="ArrowDown"?16:0);
    clampWindow();persist();
  });
  function syncCurtain(){
    const opened=!$("historySheet").hidden;
    backdrop.hidden=!opened;
    if(opened){$("historySheet").setAttribute("aria-label","Full transcript curtain");}
  }
  host.syncCurtain=syncCurtain;
  window.addEventListener("resize",clampWindow);
  window.visualViewport?.addEventListener("resize",clampWindow);
  window.visualViewport?.addEventListener("scroll",clampWindow);
  root.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      if(!$("historySheet").hidden)host.toggleHistory(false);
      else if(!$("panel").hidden)host.open(false);
    }
  });
  setMode(layout);
  // Default caption is one or two lines, not an expanding full-page stack.
  host.setLineCount(2);
  syncCurtain();
}
