/**
 * UI-only reusable floating controls. No microphone permissions or network calls.
 * Use <speech-floating-controls> and setState({...}).
 * Events: speech:toggle, speech:language-change, speech:display-change.
 */
const languages=[["he","עברית"],["en","English"],["ar","العربية"],["es","Español"],["fr","Français"],["de","Deutsch"],["ru","Русский"],["it","Italiano"]];
export class SpeechFloatingControls extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:"open"});
    this.state={listening:false,source:"he",target:"en",mode:"bottom"};
  }
  connectedCallback(){
    if(this.shadowRoot.childNodes.length)return;
    this.shadowRoot.innerHTML="<style>\n:host{display:block;position:fixed;left:12px;right:12px;bottom:max(10px,env(safe-area-inset-bottom));z-index:90;font:inherit;color:#f7f0ff}\n*{box-sizing:border-box}button,select{font:inherit}\n.bar{display:flex;gap:7px;padding:8px;align-items:center;border:1px solid #b99bea88;background:#1d1431f5;border-radius:18px;box-shadow:0 12px 35px #05010caa;backdrop-filter:blur(12px)}\nbutton{min-height:46px;border:1px solid #a990de77;border-radius:12px;background:#3c2c59;color:#fff;padding:8px 12px;touch-action:manipulation}\nbutton:focus-visible,select:focus-visible{outline:2px solid #ffe092;outline-offset:2px}\n#record{flex:1;font-weight:800;background:#b89beb;color:#180e27}\n#record[aria-pressed=true]{background:#efa1bc;color:#27091b}\n#langs{font-weight:750;white-space:nowrap;font-size:12px}\n#settings{min-width:44px;font-size:18px}\n.panel{position:absolute;bottom:calc(100% + 10px);left:0;right:0;border:1px solid #ab8bcf;background:#241936;border-radius:17px;padding:14px;box-shadow:0 10px 30px #000a}\n.panel[hidden]{display:none}\n.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}\n.head strong{font-size:14px}.head button{min-height:34px}\n.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n.field{display:grid;gap:6px;min-width:0}\nlabel{font-size:11px;color:#dac7ee;font-weight:750}\nselect{width:100%;min-height:44px;border:1px solid #ad88d999;border-radius:10px;padding:8px 6px;background:#130e22;color:#fff}\n.actions{display:flex;gap:8px;margin-top:12px}.actions #apply{flex:1;background:#bea2f4;color:#1b102d;font-weight:800}\np{font-size:11px;line-height:1.5;color:#bbadc9}\n@media(min-width:741px){:host{display:none}}\n/* Focused translated excerpt: text is set only from host-provided data. */\n.caption-shell{margin-bottom:7px;padding:9px 12px;border:1px solid #aa93d666;\n border-radius:15px;background:rgba(13,10,28,.96);backdrop-filter:blur(12px);\n box-shadow:0 7px 26px #06030c95}\n.caption-shell[hidden]{display:none}\n.caption-meta{display:flex;justify-content:space-between;align-items:center;gap:7px;\n color:#baa9d6;font-size:10px;letter-spacing:.3px;margin-bottom:4px}\n.caption-meta #captionStatus{max-width:68%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n.caption-viewport{max-height:calc(var(--floating-lines,2)*1.38em);overflow:hidden;\n color:#ffe495;font-size:clamp(16px,4vw,21px);line-height:1.38;font-weight:700;\n overflow-wrap:anywhere;unicode-bidi:plaintext}\n#captionText{white-space:pre-wrap}\n#peek{min-width:42px;font-size:16px;padding:6px}\n</style>\n<div id=\"captionShell\" class=\"caption-shell\">\n  <div class=\"caption-meta\"><span id=\"captionDirection\">HE → EN</span><span id=\"captionStatus\">Original / waiting</span></div>\n  <div id=\"captionViewport\" class=\"caption-viewport\" dir=\"auto\"><div id=\"captionText\">Start speaking to see live captions…</div></div>\n</div>\n<div class=\"bar\">\n<button id=\"record\" type=\"button\" aria-pressed=\"false\" aria-label=\"Start recording\">🎙 Start</button>\n<button id=\"peek\" type=\"button\" aria-label=\"Hide floating subtitles\" aria-pressed=\"true\">▤</button>\n<button id=\"langs\" type=\"button\" aria-label=\"Choose languages\" aria-expanded=\"false\">HE → EN</button>\n<button id=\"settings\" type=\"button\" aria-label=\"Open floating controls\" aria-expanded=\"false\">⚙</button>\n</div>\n<section class=\"panel\" id=\"panel\" hidden aria-label=\"Speech preferences\">\n<div class=\"head\"><strong>Listening preferences</strong><button id=\"close\" type=\"button\" aria-label=\"Close preferences\">✕</button></div>\n<div class=\"fields\">\n<div class=\"field\"><label for=\"source\">Listen in</label><select id=\"source\"></select></div>\n<div class=\"field\"><label for=\"target\">Translate to</label><select id=\"target\"></select></div>\n</div>\n<div class=\"field\" style=\"margin-top:9px\"><label for=\"display\">Caption display</label>\n<select id=\"display\">\n<option value=\"bottom\">Subtitles</option><option value=\"append\">Paragraph feed</option>\n<option value=\"roll\">Rising</option><option value=\"ticker\">Ticker</option>\n</select></div>\n<div class=\"actions\"><button id=\"swap\" type=\"button\">⇆ Swap</button><button id=\"apply\" type=\"button\">Apply</button></div>\n<p>Changes to listening language take effect when the microphone is restarted. This widget is UI-only and never processes audio.</p>\n</section>";
    const $=id=>this.shadowRoot.getElementById(id);
    for(const [code,label] of languages){
      for(const id of ["source","target"]){
        const option=document.createElement("option");
        option.value=code;option.textContent=label;$(id).append(option);
      }
    }
    $("record").addEventListener("click",()=>this.emit("speech:toggle"));
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
    if(yes)$("source").focus();
    else $("record").focus();
  }
  setCaptionVisible(yes){
    const $=id=>this.shadowRoot.getElementById(id);
    $("captionShell").hidden=!Boolean(yes);
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
    $("record").textContent=this.state.listening?"■ Stop mic":"🎙 Start";
    $("langs").textContent=String(this.state.source).toUpperCase()+" → "+String(this.state.target).toUpperCase();
    if($("panel").hidden){
      $("source").value=this.state.source;
      $("target").value=this.state.target;
      $("display").value=this.state.mode;
    }
  }
}
if(!customElements.get("speech-floating-controls"))
  customElements.define("speech-floating-controls",SpeechFloatingControls);
