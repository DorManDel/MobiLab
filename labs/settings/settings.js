import {SettingsRegistry,SettingsStore,registerDefaultModules,CONFETTI_MODULE,LAYOUTS,PINNED_PORTFOLIO_SHA} from './engine.js';

const registry = new SettingsRegistry();registerDefaultModules(registry);
const store = new SettingsStore(registry);
const $ = id => document.getElementById(id);
const workspace=$('workspace'),dock=$('dock');
let tab=store.state.tab, page=0, search='', collapsed=false, realBridgeToken='', originalReady=false;
let realInventory=null, sourceLoading=false;
const pageSize=3;
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
const state=store.state;
if(state.optionalModules?.includes('confetti')&&!registry.has('confetti'))registry.registerModule(CONFETTI_MODULE);
const updateStatus=msg=>{$('readout').textContent=msg;$('labStatus').textContent=state.layout.toUpperCase()+' / LOCAL'};
const allVisible=()=>registry.list().filter(m=>!state.hiddenModules.includes(m.id)&&(state.mode!=='visitor'||m.public));
const tabFields=m=>m.fields.filter(f=>!search||`${m.title} ${f.title} ${f.help||''}`.toLowerCase().includes(search));
const activeModule=()=>registry.get(tab);
const safeStorage=()=>{store.persist()};

function applyDemo(){
 const get=(a,b)=>store.get(a,b),calm=get('access','calm');
 document.documentElement.style.setProperty('--ripple-strength',!calm&&get('ripple','enabled')?get('ripple','strength')/100:0);
 document.documentElement.style.setProperty('--ripple-size',get('ripple','wave')/70);
 document.documentElement.style.setProperty('--prism-opacity',!calm&&get('prism','enabled')?get('prism','strength')/100:0);
 document.documentElement.style.setProperty('--prism-depth',!calm&&get('prism','enabled')?get('prism','depth')+'deg':'0deg');
 document.documentElement.style.setProperty('--cover-gap',12+'px');
 $('heroTarget').style.fontSize=get('access','larger-text')?'1.12em':'1em';
 $('heroTarget').style.borderColor=get('access','contrast')?'#ffe5aa':'#d2b8ff80';
 $('carouselTarget').style.opacity=1;
}
function setLayout(layout){
 if(!LAYOUTS.includes(layout))return;store.setLayout(layout);page=0;renderLayout();renderControls();sendRealApply();
}
function renderLayout(){
 workspace.dataset.layout=state.layout;workspace.dataset.corner=state.corner;workspace.dataset.edgeSide=state.handleSide||'right';
 workspace.style.setProperty('--dock-opacity',(state.opacity/100).toFixed(2));
 dock.dataset.locked=String(state.locked);
 $('corner').value=state.corner;$('edgeSide').value=state.handleSide||'right';$('opacity').value=state.opacity;$('opacityOutput').textContent=state.opacity+'%';$('locked').checked=state.locked;$('pinned').checked=state.pinned;
 $('cornerLabel').hidden=state.layout!=='corner';$('customFields').hidden=state.layout!=='custom';
 document.querySelectorAll('#presets button[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===state.layout)));
 const names={corner:'Corner · '+({br:'bottom right',bl:'bottom left',tr:'top right',tl:'top left'}[state.corner]),top:'Top dock',side:'Side dock',bottom:'Bottom sheet',custom:'Floating / Custom'};
 $('dockPosition').textContent=names[state.layout];
 if(state.layout==='custom')applyGeometry(state.geometry||initialGeometry());
 $('resizeHandle').setAttribute('aria-disabled',String(state.locked));
 updateStatus(names[state.layout]+(state.locked?' · locked':'')+(state.layout==='custom'?' · drag title to move, corner to resize':''));
 populateProfiles();
}
function initialGeometry(){const r=workspace.getBoundingClientRect(),w=Math.min(360,Math.max(235,r.width*.78)),h=Math.min(390,Math.max(220,r.height*.56));return {x:Math.max(8,(r.width-w)/2)/r.width,y:Math.max(8,(r.height-h)/2)/r.height,w:w/r.width,h:h/r.height}}
function applyGeometry(geometry){
 if(state.layout!=='custom')return;
 const r=workspace.getBoundingClientRect(),g=store.validateGeometry(geometry),margin=8;
 const maxW=Math.max(200,r.width-2*margin),maxH=Math.max(180,r.height-2*margin);
 let w=clamp(g.w*r.width,Math.min(230,maxW),maxW),h=clamp(g.h*r.height,Math.min(220,maxH),maxH);
 let x=clamp(g.x*r.width,margin,Math.max(margin,r.width-w-margin)),y=clamp(g.y*r.height,margin,Math.max(margin,r.height-h-margin));
 workspace.style.setProperty('--custom-x',x+'px');workspace.style.setProperty('--custom-y',y+'px');workspace.style.setProperty('--custom-w',w+'px');workspace.style.setProperty('--custom-h',h+'px');
}
function currentGeometry(){const p=workspace.getBoundingClientRect(),d=dock.getBoundingClientRect();return store.validateGeometry({x:(d.left-p.left)/p.width,y:(d.top-p.top)/p.height,w:d.width/p.width,h:d.height/p.height})}
function saveGeometry(){if(state.layout!=='custom')return;state.geometry=currentGeometry();safeStorage()}
function populateProfiles(){const el=$('savedCustom');const old=el.value;el.replaceChildren(new Option('Choose saved layout…',''));
 for(const p of state.customPresets)el.add(new Option(p.name,p.name));el.value=state.customPresets.some(p=>p.name===old)?old:''}
function setMode(mode){state.mode=mode;page=0;safeStorage();renderControls();sendRealApply()}
function renderControls(){
 const list=allVisible(),visible = search?list.filter(m=>tabFields(m).length>0):list;
 if(!visible.some(m=>m.id===tab))tab=visible[0]?.id||'';
 state.tab=tab;safeStorage();
 $('tabs').replaceChildren(...visible.map(m=>{const b=document.createElement('button');b.type='button';b.className=m.id===tab?'active':'';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(m.id===tab));b.title=m.title;
 const icon=document.createElement('span');icon.textContent=m.icon;icon.setAttribute('aria-hidden','true');const title=document.createElement('span');title.textContent=m.title.split(' ')[0];b.append(icon,title);b.onclick=()=>{tab=m.id;page=0;renderControls()};return b}));
 $('visitor').classList.toggle('active',state.mode==='visitor');$('developer').classList.toggle('active',state.mode==='developer');$('modeToggle').textContent=state.mode==='developer'?'DEV':'VIS';
 const module=activeModule(),fields=module?tabFields(module):[];
 const maxPage=Math.max(0,Math.ceil(fields.length/pageSize)-1);page=clamp(page,0,maxPage);
 $('groupTitle').textContent=module?.title||'No matches';$('groupCount').textContent=(fields.length?1+page*pageSize:0)+'–'+Math.min(fields.length,(page+1)*pageSize)+' / '+fields.length;
 $('controls').replaceChildren(...fields.slice(page*pageSize,(page+1)*pageSize).map(f=>renderControl(module,f)));
 $('pageStatus').textContent=(page+1)+' / '+(maxPage+1);$('previousPage').disabled=page===0;$('nextPage').disabled=page>=maxPage;
 $('toggleModule').textContent=registry.has('confetti')? '− Confetti':'+ Module';
 applyDemo();
}
function renderControl(module,f){
 const root=document.createElement('div');root.className='control';const head=document.createElement('div');head.className='control-head';const label=document.createElement('strong');label.textContent=f.title;
 const output=document.createElement('output');const fmt=v=>f.type==='toggle'?(v?'ON':'OFF'):(v+(f.unit||''));output.textContent=fmt(store.get(module.id,f.id));head.append(label,output);root.append(head);
 const input=document.createElement('input');input.type=f.type==='toggle'?'checkbox':'range';input.setAttribute('aria-label',f.title);input.className=f.type==='toggle'?'toggle':'range';
 if(f.type==='toggle')input.checked=store.get(module.id,f.id);else{input.min=f.min;input.max=f.max;input.step='1';input.value=store.get(module.id,f.id)};
 input.oninput=()=>{const val=f.type==='toggle'?input.checked:Number(input.value);const applied=store.set(module.id,f.id,val);output.textContent=fmt(applied);applyDemo()};root.append(input);
 const hint=document.createElement('small');hint.textContent=f.help||module.status;root.append(hint);return root;
}
function download(name,body,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type:type||'application/json'}));a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function handleEdge(){dock.classList.toggle('is-hidden');const hidden=dock.classList.contains('is-hidden');$('edgeHandle').setAttribute('aria-expanded',String(!hidden));updateStatus(hidden?'Edge Handle active — tap ⚙ to reopen':'Settings restored')}

// Handle-sized pointer controls, constrained to the workspace; only Custom can move or resize.
let gesture=null;
function startGesture(event,kind){
 if(state.layout!=='custom'||state.locked||event.button!==0||dock.classList.contains('is-collapsed'))return;
 if(kind==='drag'&&event.target.closest('button,input,select'))return;
 event.preventDefault();const r=dock.getBoundingClientRect(),p=workspace.getBoundingClientRect();
 gesture={id:event.pointerId,kind,cx:event.clientX,cy:event.clientY,x:r.left-p.left,y:r.top-p.top,w:r.width,h:r.height};event.currentTarget.setPointerCapture(event.pointerId);
}
function moveGesture(event){if(!gesture||gesture.id!==event.pointerId)return;
 const p=workspace.getBoundingClientRect(),minMargin=8,maxW=Math.max(200,p.width-2*minMargin),maxH=Math.max(180,p.height-2*minMargin),g=gesture;
 if(g.kind==='drag'){
 const x=clamp(g.x+event.clientX-g.cx,minMargin,Math.max(minMargin,p.width-g.w-minMargin)),y=clamp(g.y+event.clientY-g.cy,minMargin,Math.max(minMargin,p.height-g.h-minMargin));
 workspace.style.setProperty('--custom-x',x+'px');workspace.style.setProperty('--custom-y',y+'px');
 }else{
 const w=clamp(g.w+event.clientX-g.cx,Math.min(230,maxW),Math.max(230,maxW)),h=clamp(g.h+event.clientY-g.cy,Math.min(220,maxH),Math.max(220,maxH));
 workspace.style.setProperty('--custom-w',Math.min(w,p.width-g.x-minMargin)+'px');workspace.style.setProperty('--custom-h',Math.min(h,p.height-g.y-minMargin)+'px');
 }
}
function endGesture(event){if(!gesture||gesture.id!==event.pointerId)return;gesture=null;saveGeometry();updateStatus('Custom position updated; Save Custom to name this layout')}
for(const [id,kind] of [['dockHandle','drag'],['resizeHandle','resize']]){
 const el=$(id);el.addEventListener('pointerdown',e=>startGesture(e,kind));el.addEventListener('pointermove',moveGesture);el.addEventListener('pointerup',endGesture);el.addEventListener('pointercancel',endGesture);
}
window.addEventListener('resize',()=>{if(state.layout==='custom')applyGeometry(state.geometry||initialGeometry());sendRealApply()});

// Source iframe bridge: iframe is sandboxed WITHOUT allow-same-origin.
// The bridge can re-dock the ORIGINAL panel IN PLACE without cloning or inventing its controls.
// Cross-origin or browser storage restrictions may prevent the original app JS from initializing.
const BRIDGE_EVENT='mobilab-settings-source-bridge-v1';
function bridgeScript(token){return `(()=>{'use strict';
 const TOKEN=${JSON.stringify(token)},TAG=${JSON.stringify(BRIDGE_EVENT)};
 const send=(type,detail)=>parent.postMessage({tag:TAG,token:TOKEN,type,detail},'*');
 function inventory(){const root=document.getElementById('settings-panel');if(!root)return null;
  const groups=[...root.querySelectorAll('details.settings-group')];return {groupCount:groups.length,controlCount:root.querySelectorAll('input,select,button,textarea').length,groups:groups.map(g=>({id:g.id||'',name:g.querySelector('summary')?.textContent?.trim()||g.id,controls:[...g.querySelectorAll('input,select,button,textarea')].map(x=>({id:x.id||'',tag:x.tagName.toLowerCase(),type:x.type||'',min:x.min||'',max:x.max||''}))}))};}
 function apply(p){const root=document.getElementById('settings-panel');if(!root){send('missing',{error:'settings-panel not found'});return;}
  const layout=['corner','top','side','bottom','custom'].includes(p.layout)?p.layout:'corner';const corner=['br','bl','tr','tl'].includes(p.corner)?p.corner:'br';
  document.body?.classList.toggle('developer-unlocked',p.developer===true);root.removeAttribute('hidden');root.removeAttribute('inert');root.removeAttribute('aria-hidden');
  for(const [name,val] of Object.entries({display:'block',visibility:'visible',opacity:'1',transform:'none'}))root.style.setProperty(name,val,'important');
  let st=document.getElementById('settings-source-dock-bridge');if(!st){st=document.createElement('style');st.id='settings-source-dock-bridge';document.head.append(st)}
  st.textContent='html body #settings-panel{position:fixed!important;z-index:2147483400!important;max-width:none!important;max-height:none!important;min-height:0!important;overflow:auto!important;box-sizing:border-box!important;border:1px solid #c5a6ffcc!important;border-radius:15px!important;padding:11px!important;background:rgba(20,17,42,'+(Math.max(.25,Math.min(1,Number(p.opacity)||.92)))+')!important;box-shadow:0 10px 35px #0009!important;backdrop-filter:blur(16px)!important}';
  const vw=window.innerWidth,vh=window.innerHeight,margin=8;
  let w=Math.min(360,vw*.76),h=vh*.49,x=vw-w-margin,y=vh-h-margin;
  if(layout==='corner'){if(corner.includes('l'))x=margin;if(corner.includes('t'))y=margin;}
  if(layout==='top'){w=Math.min(470,vw*.82);h=vh*.43;x=vw-w-margin;y=margin;}
  if(layout==='side'){w=vw*.66;h=vh;x=vw-w;y=0;}
  if(layout==='bottom'){w=vw;h=vh*.54;x=0;y=vh-h;}
  if(layout==='custom'&&p.geometry){const g=p.geometry;w=Math.max(210,Math.min(vw-2*margin,Number(g.w)*vw));h=Math.max(210,Math.min(vh-2*margin,Number(g.h)*vh));x=Math.max(margin,Math.min(vw-w-margin,Number(g.x)*vw));y=Math.max(margin,Math.min(vh-h-margin,Number(g.y)*vh));}
  root.style.setProperty('left',x+'px','important');root.style.setProperty('top',y+'px','important');root.style.setProperty('width',Math.max(180,w)+'px','important');root.style.setProperty('height',Math.max(180,h)+'px','important');root.style.setProperty('right','auto','important');root.style.setProperty('bottom','auto','important');
  send('applied',{layout,inventory:inventory()});
 }
 window.addEventListener('message',e=>{if(e.source!==parent||e.data?.tag!==TAG||e.data?.token!==TOKEN)return;if(e.data.type==='apply')apply(e.data.detail||{});if(e.data.type==='inventory')send('inventory',inventory());});
 let tries=0;function ready(){if(document.readyState==='loading'&&tries++<10){setTimeout(ready,100);return}send('ready',{inventory:inventory()});}ready();
})();`}
function sendRealApply(){if(!originalReady||!realBridgeToken)return;const g=state.geometry||initialGeometry();$('originalFrame').contentWindow?.postMessage({tag:BRIDGE_EVENT,token:realBridgeToken,type:'apply',detail:{layout:state.layout,corner:state.corner,opacity:state.opacity/100,geometry:g,developer:state.mode==='developer'}},'*')}
window.addEventListener('message',e=>{
 if(e.source!==$('originalFrame').contentWindow||e.data?.tag!==BRIDGE_EVENT||e.data?.token!==realBridgeToken)return;
 const {type,detail}=e.data;
 if(type==='ready'){originalReady=true;realInventory=detail?.inventory||null;sendRealApply();$('sourceStatus').textContent='Original HTML loaded in a restricted sandbox; checking control inventory. Source: pinned '+PINNED_PORTFOLIO_SHA.slice(0,9)+'.';}
 if(type==='missing'){$('sourceStatus').textContent='Source loaded, but the settings element is missing. Verify this is the MyPortfolio index.html.'}
 if(type==='applied'||type==='inventory'){
  realInventory=detail?.inventory||detail||null;
  if(realInventory){$('inventory').hidden=false;$('inventory').textContent=realInventory.groupCount+' groups / '+realInventory.controlCount+' original controls.\n'+realInventory.groups.map(g=>'• '+g.name+' ('+g.controls.length+')').join('\n');$('exportInventory').disabled=false;
   $('sourceStatus').textContent='Actual settings DOM detected: '+realInventory.groupCount+' groups and '+realInventory.controlCount+' controls. Native listeners work only if their source scripts initialize in the sandbox.';}
 }
});
function renderOriginal(source){
 if(typeof source!=='string'||source.length>13_000_000||!/<html\b/i.test(source))throw Error('Choose a real HTML page under 13 MB');
 originalReady=false;realInventory=null;realBridgeToken=crypto.randomUUID?.()||String(Date.now())+Math.random();
 const script=bridgeScript(realBridgeToken).replace(/<\/script/gi,'<\\/script');
 // Keep pinned assets relative to published site. Some pinned scripts may differ or be blocked.
 const base='<base href="https://dormandel.github.io/Dor-s-Profile-Site/" target="_blank">';
 let html=source.replace(/<head([^>]*)>/i,(match,attr)=>'<head'+attr+'>'+base);
 html=html.replace(/<\/body\s*>/i,`<script>${script}<\/script></body>`);
 if(html===source)throw Error('Could not inject isolated preview bridge');
 $('originalFrame').srcdoc=html;workspace.classList.add('is-original');$('stageMode').textContent='ORIGINAL SITE / SANDBOXED SOURCE';$('sourceStatus').textContent='Initializing original HTML within a sandbox…';$('originalSection').hidden=false;updateStatus('Original source view; demo settings dock hidden.');
}
function unloadOriginal(){originalReady=false;realInventory=null;realBridgeToken='';$('originalFrame').removeAttribute('srcdoc');workspace.classList.remove('is-original');$('stageMode').textContent='DEMO · SOURCE-INFORMED SETTINGS';$('sourceStatus').textContent='Original source unloaded; demo settings restored.';renderLayout()}

// Top level controls and module lifecycle.
$('layoutToggle').onclick=()=>{const c=$('layoutControls');c.hidden=!c.hidden;$('layoutToggle').setAttribute('aria-expanded',String(!c.hidden))};
document.querySelectorAll('#presets button[data-layout]').forEach(b=>b.onclick=()=>setLayout(b.dataset.layout));
$('corner').onchange=e=>{state.corner=e.target.value;safeStorage();renderLayout();sendRealApply()};
$('opacity').oninput=e=>{state.opacity=clamp(+e.target.value,25,100);$('opacityOutput').textContent=state.opacity+'%';workspace.style.setProperty('--dock-opacity',state.opacity/100);safeStorage();sendRealApply()};
$('locked').onchange=e=>{state.locked=e.target.checked;safeStorage();renderLayout()};
$('pinned').onchange=e=>{state.pinned=e.target.checked;safeStorage();updateStatus(state.pinned?'Settings pinned open':'Tap the preview outside settings to auto-hide')};
$('edgeSide').onchange=e=>{state.handleSide=e.target.value==='left'?'left':'right';safeStorage();renderLayout()};
$('dockLayout').onclick=()=>{$('layoutControls').hidden=false;$('layoutToggle').setAttribute('aria-expanded','true');$('layoutControls').scrollIntoView({behavior:'smooth',block:'start'})};
$('saveCustom').onclick=()=>{if(state.layout!=='custom')return;let name=store.saveCustom($('customName').value,currentGeometry());populateProfiles();$('savedCustom').value=name;updateStatus('Saved preset: '+name)};
$('loadCustom').onclick=()=>{const preset=state.customPresets.find(p=>p.name===$('savedCustom').value);if(!preset)return;state.geometry=preset.geometry;setLayout('custom');applyGeometry(preset.geometry);safeStorage();updateStatus('Custom preset loaded: '+preset.name)};
$('resetGeometry').onclick=()=>{state.geometry=initialGeometry();safeStorage();applyGeometry(state.geometry);updateStatus('Floating layout centered')};
$('resetLayout').onclick=()=>{store.resetLayout();state.mode='developer';renderLayout();renderControls();sendRealApply()};
$('visitor').onclick=()=>setMode('visitor');$('developer').onclick=()=>setMode('developer');$('modeToggle').onclick=()=>setMode(state.mode==='developer'?'visitor':'developer');
$('search').oninput=e=>{search=e.target.value.trim().toLowerCase();page=0;renderControls()};
$('previousPage').onclick=()=>{page=Math.max(0,page-1);renderControls()};$('nextPage').onclick=()=>{page++;renderControls()};
$('toggleModule').onclick=()=>{if(registry.has('confetti')){registry.unregisterModule('confetti');state.optionalModules=[];if(tab==='confetti')tab='ripple'}else{registry.registerModule(CONFETTI_MODULE);state.optionalModules=['confetti']}safeStorage();page=0;renderControls();updateStatus('Demo module registry: '+registry.list().length+' modules')};
$('collapse').onclick=()=>{collapsed=!collapsed;dock.classList.toggle('is-collapsed',collapsed);$('dockBody').hidden=collapsed;$('collapse').textContent=collapsed?'+':'−';$('collapse').setAttribute('aria-label',collapsed?'Expand settings':'Collapse settings')};
$('edgeHandle').onclick=handleEdge;
workspace.addEventListener('pointerdown',event=>{if(state.pinned||workspace.classList.contains('is-original')||dock.contains(event.target)||event.target===$('edgeHandle'))return;dock.classList.add('is-hidden');$('edgeHandle').setAttribute('aria-expanded','false')});
$('resetValues').onclick=()=>{store.resetValues();renderControls();updateStatus('Only demo setting values reset')};
$('exportConfig').onclick=()=>download('mobilab-settings-layout-v1.json',store.export());
$('openOriginal').onclick=()=>{$('originalSection').hidden=!$('originalSection').hidden;if(!$('originalSection').hidden)$('originalSection').scrollIntoView({behavior:'smooth',block:'start'})};
$('togglePreview').onclick=unloadOriginal;$('unloadOriginal').onclick=unloadOriginal;
$('fetchOriginal').onclick=async()=>{
 if(sourceLoading)return;sourceLoading=true;$('fetchOriginal').disabled=true;$('sourceStatus').textContent='Loading original source from GitHub at pinned SHA…';
 try{const url=`https://raw.githubusercontent.com/DorManDel/Dor-s-Profile-Site/${PINNED_PORTFOLIO_SHA}/index.html`;const res=await fetch(url,{cache:'force-cache'});if(!res.ok)throw Error('HTTP '+res.status);const src=await res.text();renderOriginal(src)}
 catch(e){$('sourceStatus').textContent='Remote source failed: '+e.message+'. Choose your local MyPortfolio index.html instead.'}
 finally{sourceLoading=false;$('fetchOriginal').disabled=false}
};
$('fileOriginal').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>13_000_000)throw Error('File exceeds 13 MB');renderOriginal(await file.text());$('sourceStatus').textContent='Initializing selected HTML: '+file.name}catch(err){$('sourceStatus').textContent=err.message}finally{e.target.value=''}};
$('showPinnedInventory').onclick=async()=>{
  const el=$('sourceStatus');
  try{
    const response=await fetch('./myportfolio-settings-inventory.json',{cache:'force-cache'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    if(data.source?.commit!==PINNED_PORTFOLIO_SHA||!Array.isArray(data.groups))throw Error('Invalid source inventory');
    realInventory={groupCount:data.summary.groups,controlCount:data.summary.controls_in_settings_panel,groups:data.groups.map(g=>({id:g.id,name:g.title,controls:g.controls}))};
    $('inventory').hidden=false;
    $('inventory').textContent='Static HTML inventory at '+PINNED_PORTFOLIO_SHA.slice(0,9)+' · '+realInventory.groupCount+' groups / '+realInventory.controlCount+' controls (including items outside groups)\n'+realInventory.groups.map(g=>'• '+g.name+' ('+g.controls.length+')').join('\n');
    $('exportInventory').disabled=false;
    el.textContent='Pinned source structure loaded. This is extracted HTML only; dynamic controls may be added by JS at runtime.';
  }catch(e){el.textContent='Pinned inventory unavailable in this offline view ('+e.message+'). Use hosted MobiLab source or load trusted local index.html.'}
};
$('exportInventory').onclick=()=>{if(realInventory)download('myportfolio-real-settings-inventory.json',JSON.stringify({sourceSha:PINNED_PORTFOLIO_SHA,inventory:realInventory},null,2))};

// Use the same registry for future apps; UI lifecycle remains explicit.
window.MobiSettingsLab=Object.freeze({
 listModules:()=>registry.list().map(m=>({id:m.id,title:m.title,status:m.status,fields:m.fields.map(f=>f.id)})),
 registerModule:m=>{const x=registry.registerModule(m);renderControls();return x.id},
 unregisterModule:id=>{const ok=registry.unregisterModule(id);if(tab===id)tab='ripple';renderControls();return ok},
 setLayout, getLayout:()=>state.layout, getValue:(moduleId,field)=>store.get(moduleId,field),
 setValue:(moduleId,field,value)=>{const val=store.set(moduleId,field,value);renderControls();return val},
 snapshot:()=>JSON.parse(store.export())
});
// Browser-safe init; source module is not automatically loaded.
renderLayout();renderControls();$('edgeHandle').setAttribute('aria-expanded','true');
