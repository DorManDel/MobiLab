/* MobiLab Settings Lab — reusable headless registry + lab-local preferences.
 * No MyPortfolio application source or published controls are duplicated here.
 */
export const STORAGE_KEY = 'mobilab.settings-lab.v1';
export const PINNED_PORTFOLIO_SHA = 'e13f57e3dbfb116003e705df89ce13fa00cfaf6a';
export const LAYOUTS = Object.freeze(['corner', 'top', 'side', 'bottom', 'custom']);
const idPattern = /^[a-z][a-z0-9-]{0,50}$/;
const safe = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(Number(v)) ? Number(v) : a));
const defaults = () => ({version:1, layout:'corner', corner:'br', opacity:92, locked:false, pinned:true, handleSide:'right', optionalModules:[],
  geometry:null, customPresets:[], values:{}, hiddenModules:[], mode:'developer', tab:'ripple'});

export class SettingsRegistry {
  #modules = new Map();
  registerModule(module) {
    if (!module || !idPattern.test(module.id) || this.#modules.has(module.id)) throw Error('Module must have a unique safe ID');
    if (typeof module.title !== 'string' || !module.title.trim() || !Array.isArray(module.fields) || module.fields.length === 0) throw Error('Module requires title and fields');
    const fields = module.fields.map(f => {
      if (!f || !idPattern.test(f.id) || !['toggle','range'].includes(f.type)) throw Error('Unsupported field');
      if (f.type === 'range' && (!Number.isFinite(f.min)||!Number.isFinite(f.max)||f.max<=f.min || !Number.isFinite(f.default) || f.default<f.min || f.default>f.max)) throw Error('Invalid range');
      if (f.type === 'toggle' && typeof f.default !== 'boolean') throw Error('Invalid toggle default');
      return Object.freeze({...f});
    });
    if (new Set(fields.map(f=>f.id)).size !== fields.length) throw Error('Duplicate field IDs');
    const normalized = Object.freeze({id:module.id,title:module.title,icon:String(module.icon||'⚙'),public:Boolean(module.public),status:String(module.status||'prototype'),fields:Object.freeze(fields)});
    this.#modules.set(module.id,normalized);
    return normalized;
  }
  unregisterModule(id){if (id==='access') throw Error('Accessibility cannot be removed');return this.#modules.delete(id)}
  get(id){return this.#modules.get(id)}
  list(){return [...this.#modules.values()]}
  has(id){return this.#modules.has(id)}
}

export class SettingsStore {
  constructor(registry, key=STORAGE_KEY){this.registry=registry;this.key=key;this.state=defaults();this.hydrate()}
  hydrate(){
    try{
      const candidate=JSON.parse(localStorage.getItem(this.key)||'null');
      if(!candidate || candidate.version!==1 || typeof candidate!=='object')return;
      const state=this.state;
      if(LAYOUTS.includes(candidate.layout))state.layout=candidate.layout;
      if(['br','bl','tr','tl'].includes(candidate.corner))state.corner=candidate.corner;
      state.opacity=safe(candidate.opacity,25,100);state.locked=candidate.locked===true;state.pinned=candidate.pinned!==false;state.handleSide=candidate.handleSide==='left'?'left':'right';state.optionalModules=Array.isArray(candidate.optionalModules)?candidate.optionalModules.filter(x=>x==='confetti'):[];
      if(candidate.geometry&&typeof candidate.geometry==='object')state.geometry=this.validateGeometry(candidate.geometry);
      if(Array.isArray(candidate.customPresets))state.customPresets=candidate.customPresets.slice(0,12).filter(p=>p&&typeof p.name==='string'&&p.geometry).map(p=>({name:p.name.slice(0,40),geometry:this.validateGeometry(p.geometry)}));
      if(candidate.values&&typeof candidate.values==='object'&&!Array.isArray(candidate.values))state.values=candidate.values;
      if(Array.isArray(candidate.hiddenModules))state.hiddenModules=candidate.hiddenModules.filter(x=>typeof x==='string').slice(0,50);
      if(['developer','visitor'].includes(candidate.mode))state.mode=candidate.mode;
      if(typeof candidate.tab==='string')state.tab=candidate.tab;
    }catch{/* disabled storage or corrupt state => safe in-memory defaults */}
  }
  persist(){try{localStorage.setItem(this.key,JSON.stringify(this.state));return true}catch{return false}}
  validateGeometry(g){return {x:safe(g.x,0,1),y:safe(g.y,0,1),w:safe(g.w,.12,1),h:safe(g.h,.14,1)}}
  get(id, field){const f=this.registry.get(id)?.fields.find(f=>f.id===field);if(!f)return undefined;
    const value=this.state.values[`${id}.${field}`];
    return f.type==='toggle'?(typeof value==='boolean'?value:f.default):(typeof value==='number'&&Number.isFinite(value)?safe(value,f.min,f.max):f.default);
  }
  set(id,field,value){const f=this.registry.get(id)?.fields.find(f=>f.id===field);if(!f)throw Error('Unknown field');
    this.state.values[`${id}.${field}`]=f.type==='toggle'?Boolean(value):safe(value,f.min,f.max);this.persist();return this.get(id,field)}
  resetValues(){this.state.values={};this.persist()}
  saveCustom(name,geometry){name=String(name||'').trim().slice(0,40)||'Custom';const g=this.validateGeometry(geometry);this.state.customPresets=this.state.customPresets.filter(p=>p.name!==name).concat([{name,geometry:g}]).slice(-12);this.state.geometry=g;this.state.layout='custom';this.persist();return name}
  setLayout(layout){if(!LAYOUTS.includes(layout))throw Error('Unknown layout');this.state.layout=layout;this.persist()}
  resetLayout(){const s=this.state;s.layout='corner';s.corner='br';s.opacity=92;s.locked=false;s.pinned=true;s.handleSide='right';s.geometry=null;this.persist()}
  export(){return JSON.stringify({engine:'MobiLab Settings Lab',createdAt:new Date().toISOString(),data:this.state},null,2)}
}

export function registerDefaultModules(reg){
 reg.registerModule({id:'access',title:'Accessibility',icon:'♿',public:true,status:'source-documented',fields:[
  {id:'larger-text',title:'Larger text',type:'toggle',default:false,help:'Visual preview of visitor text scale'},
  {id:'calm',title:'Calm mode',type:'toggle',default:false,help:'Disable decorative motion'},
  {id:'contrast',title:'High contrast',type:'toggle',default:false,help:'Preview a higher-contrast card'}]});
 reg.registerModule({id:'ripple',title:'Ripple Effects',icon:'◉',status:'source-verified prototype',fields:[
  {id:'enabled',title:'Enable Ripple',type:'toggle',default:false,help:'This page uses a CSS preview, not WebGL'},
  {id:'strength',title:'Strength',type:'range',min:0,max:100,default:100,unit:'%',help:'WaterRipple V2 preferred strength'},
  {id:'wave',title:'Wave size',type:'range',min:20,max:140,default:70,unit:'',help:'Ring width preview in this lab'}]});
 reg.registerModule({id:'prism',title:'Prism Tilt',icon:'◇',status:'source-verified lightweight overlay',fields:[
  {id:'enabled',title:'Enable Prism',type:'toggle',default:false,help:'Only simulated gloss in this demo'},
  {id:'strength',title:'Prism strength',type:'range',min:0,max:100,default:74,unit:'%',help:'Owner Main Profile value'},
  {id:'depth',title:'3D depth',type:'range',min:0,max:30,default:16,unit:'°',help:'Owner Main Profile depth'}]});
 reg.registerModule({id:'carousel',title:'Carousel',icon:'▣',status:'source-verified Ratchet V3',fields:[
  {id:'sound',title:'Selection sound',type:'toggle',default:false,help:'No real audio is played in this layout demo'},
  {id:'volume',title:'Click volume',type:'range',min:0,max:100,default:46,unit:'%',help:'Source Ratchet V3 setting'},
  {id:'detents',title:'Detents per card',type:'range',min:1,max:3,default:2,unit:'',help:'Source Ratchet V3 setting'}]});
 reg.registerModule({id:'performance',title:'Performance',icon:'◴',status:'source-documented HUD',fields:[
  {id:'fps',title:'Show FPS',type:'toggle',default:false,help:'Source HUD is requestAnimationFrame-sampled'},
  {id:'quality',title:'Quality budget',type:'range',min:25,max:100,default:100,unit:'%',help:'Experimental visual preview only'}]});
}
export const CONFETTI_MODULE={id:'confetti',title:'Confetti FX',icon:'✦',status:'proposed layout demo',fields:[
 {id:'enabled',title:'Enable particles',type:'toggle',default:false,help:'Optional demo plugin'},
 {id:'count',title:'Particle budget',type:'range',min:10,max:160,default:80,unit:'',help:'Demonstrates adding controls without editing core UI'}]};
