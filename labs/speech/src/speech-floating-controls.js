/**
 * UI-only reusable floating controls. No microphone permissions or network calls.
 * Use <speech-floating-controls> and setState({...}).
 * Events: speech:toggle, speech:language-change, speech:display-change.
 */
const languages=[["he","עברית"],["en","English"],["ar","العربية"],["es","Español"],["fr","Français"],["de","Deutsch"],["ru","Русский"],["it","Italiano"]];
export class SpeechFloatingControls extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:"open"});
    this.state={listening:false,source:"he",target:"en",mode:"bottom",lines:2,provider:"cloud"};
    this.historyRows=[];
    this.historyLimit=80;
    this.historySize=1;
  }
  connectedCallback(){
    if(this.shadowRoot.childNodes.length)return;
    this.shadowRoot.innerHTML="<style>\n:host{display:block;position:fixed;left:12px;right:12px;bottom:max(10px,env(safe-area-inset-bottom));z-index:90;font:inherit;color:#f7f0ff}\n*{box-sizing:border-box}button,select{font:inherit}\n.bar{display:flex;gap:7px;padding:8px;align-items:center;border:1px solid #b99bea88;background:#1d1431f5;border-radius:18px;box-shadow:0 12px 35px #05010caa;backdrop-filter:blur(12px)}\nbutton{min-height:46px;border:1px solid #a990de77;border-radius:12px;background:#3c2c59;color:#fff;padding:8px 12px;touch-action:manipulation}\nbutton:focus-visible,select:focus-visible{outline:2px solid #ffe092;outline-offset:2px}\n#record{flex:1;font-weight:800;background:#b89beb;color:#180e27}\n#record[aria-pressed=true]{background:#efa1bc;color:#27091b}\n#langs{font-weight:750;white-space:nowrap;font-size:12px}\n#settings{min-width:44px;font-size:18px}\n.panel{position:absolute;bottom:calc(100% + 10px);left:0;right:0;border:1px solid #ab8bcf;background:#241936;border-radius:17px;padding:14px;box-shadow:0 10px 30px #000a}\n.panel[hidden]{display:none}\n.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}\n.head strong{font-size:14px}.head button{min-height:34px}\n.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n.field{display:grid;gap:6px;min-width:0}\nlabel{font-size:11px;color:#dac7ee;font-weight:750}\nselect{width:100%;min-height:44px;border:1px solid #ad88d999;border-radius:10px;padding:8px 6px;background:#130e22;color:#fff}\n.actions{display:flex;gap:8px;margin-top:12px}.actions #apply{flex:1;background:#bea2f4;color:#1b102d;font-weight:800}\np{font-size:11px;line-height:1.5;color:#bbadc9}\n@media(min-width:741px){:host{display:none}}\n/* Focused translated excerpt: text is set only from host-provided data. */\n.caption-shell{margin-bottom:7px;padding:9px 12px;border:1px solid #aa93d666;\n border-radius:15px;background:rgba(13,10,28,.96);backdrop-filter:blur(12px);\n box-shadow:0 7px 26px #06030c95}\n.caption-shell[hidden]{display:none}\n.caption-meta{display:flex;justify-content:space-between;align-items:center;gap:7px;\n color:#baa9d6;font-size:10px;letter-spacing:.3px;margin-bottom:4px}\n.caption-meta #captionStatus{max-width:68%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n.caption-viewport{max-height:calc(var(--floating-lines,2)*1.38em);overflow:hidden;\n color:#ffe495;font-size:clamp(16px,4vw,21px);line-height:1.38;font-weight:700;\n overflow-wrap:anywhere;unicode-bidi:plaintext}\n#captionText{white-space:pre-wrap}\n#peek{min-width:42px;font-size:16px;padding:6px}\n\n/* v0.7 · portfolio-inspired liquid glass dock, no per-frame animation */\n:host{--vb-highlight:#f5d47d;--vb-edge:#b89bfe}\n.bar,.caption-shell,.history-sheet,.panel{\n background:linear-gradient(125deg,rgba(43,47,76,.9),rgba(16,17,38,.94) 62%,rgba(45,30,72,.94));\n border:1px solid rgba(215,204,255,.28);\n box-shadow:inset 0 1px 1px rgba(255,255,255,.18),0 15px 32px rgba(2,3,18,.35);\n -webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%);\n}\n.bar{border-radius:23px;padding:7px;gap:5px}\n.bar button{flex-shrink:0;min-width:42px;border-radius:14px;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;background:rgba(255,255,255,.07)}\n.bar button:active{transform:scale(.94)}\n#record{display:flex;justify-content:center;align-items:center;gap:4px;min-width:86px;flex:1 1 auto;\n border:1px solid rgba(244,221,166,.55);color:#fff;\n background:linear-gradient(145deg,rgba(132,113,192,.42),rgba(58,49,97,.76));\n box-shadow:inset 0 1px rgba(255,255,255,.27),0 2px 12px rgba(134,103,225,.23)}\n#record[aria-pressed=true]{background:linear-gradient(145deg,rgba(160,77,117,.7),rgba(84,42,84,.8));border-color:#f9abce;\n box-shadow:0 0 16px rgba(244,96,145,.3),inset 0 1px rgba(255,255,255,.25)}\n.mic-art{display:block;width:35px;height:43px;flex:none;filter:drop-shadow(0 3px 3px rgba(0,0,0,.4))}\n.mic-art svg{display:block;width:100%;height:100%}\n.mic-label{font-size:12px;letter-spacing:.2px}\n#record[aria-pressed=true] .mic-art{filter:drop-shadow(0 0 6px rgba(255,150,177,.7))}\n#langs{font-size:10px;padding:7px 4px;min-width:51px}\n#historyToggle,#speak{font-size:18px;min-width:42px;padding:5px}\n#historyToggle[aria-expanded=true]{border-color:#e7c889;color:var(--vb-highlight)}\n.caption-shell{border-radius:18px;background:linear-gradient(120deg,rgba(11,20,42,.93),rgba(35,23,59,.92))}\n.caption-viewport{color:var(--vb-highlight)}\n.history-sheet{display:flex;flex-direction:column;overflow:hidden;margin-bottom:9px;\n border-radius:22px;height:var(--vb-sheet-height,42dvh);min-height:126px;max-height:min(76dvh,700px)}\n.history-sheet[hidden]{display:none}\n.sheet-grip{height:25px;touch-action:pan-x;cursor:ns-resize;display:flex;justify-content:center;align-items:center}\n.sheet-grip:before{content:\"\";width:44px;height:5px;border-radius:99px;background:rgba(235,223,255,.47)}\n.sheet-head{display:flex;justify-content:space-between;align-items:center;gap:9px;padding:0 13px 9px;border-bottom:1px solid rgba(255,255,255,.08)}\n.sheet-head strong{font-size:13px;letter-spacing:.25px}\n.sheet-head .sheet-actions{display:flex;gap:5px}\n.sheet-head button{min-height:33px;padding:6px 10px;font-size:11px;border-radius:10px}\n.sheet-hint{padding:6px 12px;color:#bdb3d7;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.sheet-list{flex:1;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:8px 10px 12px;min-height:0}\n.history-item{width:100%;display:block;text-align:start;margin:0 0 9px;padding:11px 12px;min-height:55px;\n border-radius:14px;border:1px solid rgba(180,157,230,.22);background:rgba(9,13,35,.43);\n color:#f7f3ff;line-height:1.48;overflow-wrap:anywhere}\n.history-item small{display:block;font-size:10px;color:#aa9dc6;margin-bottom:4px}\n.history-item .source{display:block;font-size:12px;color:#d3cdea;white-space:pre-wrap;unicode-bidi:plaintext}\n.history-item .translation{display:block;color:#fbe5a9;font-size:14px;font-weight:650;margin-top:6px;white-space:pre-wrap;unicode-bidi:plaintext}\n.history-item:focus-visible{outline:2px solid #f9d986}\n.sheet-older{display:block;width:100%;padding:8px;color:#fce4a4;font-size:12px}\n@media(max-width:380px){#peek{display:none}.bar{gap:4px;padding:6px}#record{min-width:82px}.mic-art{width:31px}}\n@media(min-width:741px){.history-sheet{display:none}}\n@media(prefers-reduced-motion:reduce){.bar button{transition:none!important}}\n</style>\n<div id=\"captionShell\" class=\"caption-shell\">\n  <div class=\"caption-meta\"><span id=\"captionDirection\">HE → EN</span><span id=\"captionStatus\">Original / waiting</span></div>\n  <div id=\"captionViewport\" class=\"caption-viewport\" dir=\"auto\"><div id=\"captionText\">Start speaking to see live captions…</div></div>\n</div>\n\n<section id=\"historySheet\" class=\"history-sheet\" hidden aria-label=\"Scrollable transcript history\">\n <div id=\"sheetGrip\" class=\"sheet-grip\" role=\"separator\" aria-label=\"Resize transcript panel\"></div>\n <div class=\"sheet-head\"><strong>Transcript &amp; translation</strong><div class=\"sheet-actions\">\n <button id=\"sheetSize\" type=\"button\" aria-label=\"Expand transcript panel\">Expand</button>\n <button id=\"sheetClose\" type=\"button\" aria-label=\"Close transcript\">✕</button></div></div>\n <div class=\"sheet-hint\" id=\"sheetHint\" role=\"status\">Original and translated paragraphs · scroll independently</div>\n <div id=\"sheetList\" class=\"sheet-list\" tabindex=\"0\" aria-label=\"Transcript paragraphs\"></div>\n</section>\n<div class=\"bar\">\n<button id=\"record\" type=\"button\" aria-pressed=\"false\" aria-label=\"Start recording\"><span class=\"mic-art\" aria-hidden=\"true\"><svg viewBox=\"0 0 44 50\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><defs><linearGradient id=\"metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop stop-color=\"#656a85\"/><stop offset=\".24\" stop-color=\"#fff7e1\"/><stop offset=\".48\" stop-color=\"#9b9fb7\"/><stop offset=\".76\" stop-color=\"#f6edf9\"/><stop offset=\"1\" stop-color=\"#66667f\"/></linearGradient><pattern id=\"mesh\" width=\"3.5\" height=\"3.5\" patternUnits=\"userSpaceOnUse\"><path d=\"M0 0L3.5 3.5M3.5 0L0 3.5\" stroke=\"#494c66\" stroke-width=\".65\"/></pattern></defs><rect x=\"9\" y=\"3\" width=\"26\" height=\"29\" rx=\"12\" fill=\"url(#metal)\" stroke=\"#f1e7d4\" stroke-width=\"1.2\"/><rect x=\"11.5\" y=\"5\" width=\"21\" height=\"24\" rx=\"10\" fill=\"url(#mesh)\" opacity=\".9\"/><path d=\"M6 20v6c0 10 7 15 16 15s16-5 16-15v-6\" stroke=\"url(#metal)\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><path d=\"M22 41v6M13 47h18\" stroke=\"#d7c9cf\" stroke-width=\"3.5\" stroke-linecap=\"round\"/></svg></span><span class=\"mic-label\">Start</span></button>\n<button id=\"historyToggle\" type=\"button\" aria-label=\"Open transcript\" aria-expanded=\"false\">▤</button>\n<button id=\"speak\" type=\"button\" aria-label=\"Speak focused translation\" title=\"Speak selected translation\">♫</button>\n<button id=\"peek\" type=\"button\" aria-label=\"Hide floating subtitles\" aria-pressed=\"true\">▤</button>\n<button id=\"langs\" type=\"button\" aria-label=\"Choose languages\" aria-expanded=\"false\">HE → EN</button>\n<button id=\"settings\" type=\"button\" aria-label=\"Open floating controls\" aria-expanded=\"false\">⚙</button>\n</div>\n<section class=\"panel\" id=\"panel\" hidden aria-label=\"Speech preferences\">\n<div class=\"head\"><strong>Listening preferences</strong><button id=\"close\" type=\"button\" aria-label=\"Close preferences\">✕</button></div>\n<div class=\"fields\">\n<div class=\"field\"><label for=\"source\">Listen in</label><select id=\"source\"></select></div>\n<div class=\"field\"><label for=\"target\">Translate to</label><select id=\"target\"></select></div>\n</div>\n<div class=\"field\" style=\"margin-top:9px\"><label for=\"display\">Caption display</label>\n<select id=\"display\">\n<option value=\"bottom\">Subtitles</option><option value=\"append\">Paragraph feed</option>\n<option value=\"roll\">Rising</option><option value=\"ticker\">Ticker</option>\n</select></div>\n<div class=\"fields\" style=\"margin-top:10px\">\n  <div class=\"field\"><label for=\"lines\">Visible subtitle lines</label>\n    <select id=\"lines\"><option value=\"1\">1 line</option><option value=\"2\" selected>2 lines</option><option value=\"3\">3 lines</option></select>\n  </div>\n  <div class=\"field\"><label for=\"provider\">Caption engine</label>\n    <select id=\"provider\">\n      <option value=\"cloud\">MyMemory</option><option value=\"fastest\">First successful</option>\n      <option value=\"local\">Chrome local</option><option value=\"libre\">My LibreTranslate</option>\n    </select>\n  </div>\n</div>\n<div class=\"actions\"><button id=\"swap\" type=\"button\">⇆ Swap</button><button id=\"apply\" type=\"button\">Apply</button></div>\n<p>Changes to listening language take effect when the microphone is restarted. This widget is UI-only and never processes audio.</p>\n</section>";
    const $=id=>this.shadowRoot.getElementById(id);
    for(const [code,label] of languages){
      for(const id of ["source","target"]){
        const option=document.createElement("option");
        option.value=code;option.textContent=label;$(id).append(option);
      }
    }
    $("record").addEventListener("click",()=>this.emit("speech:toggle"));
    $("speak").addEventListener("click",()=>this.emit("speech:speak"));
    $("historyToggle").addEventListener("click",()=>this.toggleHistory());
    $("sheetClose").addEventListener("click",()=>this.toggleHistory(false));
    $("sheetSize").addEventListener("click",()=>this.resizeHistory());
    let startY=null;
    $("sheetGrip").addEventListener("pointerdown",event=>{
      if(event.pointerType==="mouse" && event.button!==0)return;
      startY=event.clientY;
      $("sheetGrip").setPointerCapture?.(event.pointerId);
    });
    $("sheetGrip").addEventListener("pointerup",event=>{
      if(startY===null)return;
      const movement=event.clientY-startY;startY=null;
      if(Math.abs(movement)>36)this.resizeHistory(movement<0?1:-1);
    });
    $("peek").addEventListener("click",()=>this.setCaptionVisible($("captionShell").hidden));
    $("langs").addEventListener("click",()=>this.open());
    $("settings").addEventListener("click",()=>this.open());
    $("close").addEventListener("click",()=>this.open(false));
    $("swap").addEventListener("click",()=>{
      const source=$("source"),target=$("target");
      [source.value,target.value]=[target.value,source.value];
    });
    $("apply").addEventListener("click",()=>{
      this.emit("speech:language-change",{source:$("source").value,target:$("target").value});
      this.emit("speech:display-change",{mode:$("display").value});
      this.emit("speech:lines-change",{lines:Number($("lines").value)});
      this.emit("speech:provider-change",{provider:$("provider").value});
      this.open(false);
    });
    this.setState(this.state);
  }
  emit(name,detail){this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true,composed:true}));}
  open(force){
    const $=id=>this.shadowRoot.getElementById(id);
    const yes=typeof force==="boolean"?force:$("panel").hidden;
    $("panel").hidden=!yes;
    $("langs").setAttribute("aria-expanded",String(yes));
    $("settings").setAttribute("aria-expanded",String(yes));
    if(yes){
      this.toggleHistory(false);
      $("source").focus();
    }
    else $("record").focus();
  }
  toggleHistory(open){
    const $=id=>this.shadowRoot.getElementById(id);
    const visible=typeof open==="boolean"?open:$("historySheet").hidden;
    $("historySheet").hidden=!visible;
    $("historyToggle").setAttribute("aria-expanded",String(visible));
    $("historyToggle").setAttribute("aria-label",visible?"Close transcript":"Open transcript");
    if(visible){
      $("captionShell").hidden=true;
      this.renderHistory(true);
    }else{
      $("captionShell").hidden=this.captionVisible===false;
    }
  }
  resizeHistory(direction=1){
    this.historySize=Math.min(2,Math.max(0,this.historySize+direction));
    this.style.setProperty("--vb-sheet-height",["24dvh","42dvh","72dvh"][this.historySize]);
    const btn=this.shadowRoot.getElementById("sheetSize");
    btn.textContent=this.historySize===2?"Shrink":"Expand";
  }
  setNotice(message){
    const $=id=>this.shadowRoot.getElementById(id);
    if($("sheetHint"))$("sheetHint").textContent=String(message);
    if($("captionStatus"))$("captionStatus").textContent=String(message);
  }
  setHistory(entries=[]){
    this.historyRows=entries;
    if(this.shadowRoot.getElementById("historySheet")?.hidden===false)this.renderHistory();
  }
  renderHistory(forceBottom=false){
    const $=id=>this.shadowRoot.getElementById(id);
    const list=$("sheetList");
    if(!list)return;
    const atBottom=forceBottom || list.scrollHeight-list.scrollTop-list.clientHeight<60;
    const previousHeight=list.scrollHeight,previousTop=list.scrollTop;
    const items=this.historyRows||[];
    const start=Math.max(0,items.length-this.historyLimit);
    const frag=document.createDocumentFragment();
    if(start>0){
      const older=document.createElement("button");
      older.type="button";older.className="sheet-older";
      older.textContent="Show "+Math.min(80,start)+" earlier paragraphs";
      older.addEventListener("click",()=>{
        this.historyLimit+=80;
        this.renderHistory(false);
        list.scrollTop=0;
      });
      frag.append(older);
    }
    for(const row of items.slice(start)){
      const entry=document.createElement("button");
      entry.type="button";entry.className="history-item";
      const meta=document.createElement("small");
      meta.textContent="#"+row.id+" · "+String(row.source||"").toUpperCase()+" → "+
        String(row.target||"").toUpperCase() + (row.displayText?" · translated":" · original");
      const source=document.createElement("span");
      source.className="source";source.dir="auto";source.textContent=row.text||"";
      const translated=document.createElement("span");
      translated.className="translation";translated.dir="auto";
      translated.textContent=row.displayText||"Awaiting translation…";
      entry.append(meta,source,translated);
      entry.addEventListener("click",()=>this.emit("speech:history-focus",{id:row.id}));
      frag.append(entry);
    }
    list.replaceChildren(frag);
    requestAnimationFrame(()=>{
      if(atBottom)list.scrollTop=list.scrollHeight;
      else list.scrollTop=Math.max(0,previousTop+list.scrollHeight-previousHeight);
    });
  }
  setCaptionVisible(yes){
    const $=id=>this.shadowRoot.getElementById(id);
    this.captionVisible=Boolean(yes);
    $("captionShell").hidden=!Boolean(yes) || !$("historySheet").hidden;
    $("peek").setAttribute("aria-pressed",String(Boolean(yes)));
    $("peek").setAttribute("aria-label",yes?"Hide floating subtitles":"Show floating subtitles");
  }
  setLineCount(count){
    const lines=[1,2,3].includes(Number(count))?Number(count):2;
    this.style.setProperty("--floating-lines",String(lines));
    this.scrollCaption();
  }
  scrollCaption(){
    const viewport=this.shadowRoot.getElementById("captionViewport");
    if(viewport)requestAnimationFrame(()=>{viewport.scrollTop=viewport.scrollHeight;});
  }
  setCaption({text="",status="",source="",target="",translated=false}={}){
    const $=id=>this.shadowRoot.getElementById(id);
    if(!$("captionText"))return;
    $("captionText").textContent=String(text)||"No recognized speech yet.";
    $("captionStatus").textContent=(translated?"TRANSLATED · ":"ORIGINAL · ")+(status||"Live");
    $("captionDirection").textContent=String(source||this.state.source).toUpperCase()+
      " → "+String(target||this.state.target).toUpperCase();
    this.scrollCaption();
  }
  setState(patch){
    this.state={...this.state,...patch};
    const $=id=>this.shadowRoot.getElementById(id);
    if(!$("record"))return;
    $("record").setAttribute("aria-pressed",String(Boolean(this.state.listening)));
    $("record").setAttribute("aria-label",this.state.listening?"Finish recording":"Start recording");
    const label=$("record").querySelector(".mic-label");
    if(label)label.textContent=this.state.listening?"Stop":"Start";
    $("langs").textContent=String(this.state.source).toUpperCase()+" → "+String(this.state.target).toUpperCase();
    if($("panel").hidden){
      $("source").value=this.state.source;
      $("target").value=this.state.target;
      $("display").value=this.state.mode;
      $("lines").value=String(this.state.lines||2);
      $("provider").value=this.state.provider||"cloud";
    }
  }
}
if(!customElements.get("speech-floating-controls"))
  customElements.define("speech-floating-controls",SpeechFloatingControls);
