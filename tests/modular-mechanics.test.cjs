// Run: node tests/modular-mechanics.test.cjs
// No npm install or device required. Device vibration/motion MUST still be tested on a phone.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function load(file, names, mocks={}) {
  const code=fs.readFileSync(path.join(root,file),"utf8")
    .replace(/^export /gm,"").replace(/^import [^\n]*$/gm,"");
  return vm.runInNewContext(code + "\n({" + names.join(",") + "})", mocks);
}
const saved=new Map(), calls=[];
const storage={
  getItem: k=>saved.has(k)?saved.get(k):null,
  setItem:(k,v)=>saved.set(k,v)
};
const { HapticEngine, sanitizePattern } = load("src/haptics.js",["HapticEngine","sanitizePattern"],{
  localStorage:storage,navigator:{vibrate: x=>{calls.push(x);return true}}
});
const h=new HapticEngine();
const id=h.saveNamed("Mission success",[200,75,1500]);
assert.match(id,/^saved-/);
assert.equal(h.allPresets()[id].name,"Mission success");
h.setGroup("confirmation",id);
assert.equal(h.config.groups.confirmation,id);
h.playGroup("confirmation");
assert.equal(JSON.stringify(calls.at(-1)),JSON.stringify([200,75,1500]));
assert.equal(new HapticEngine().config.groups.confirmation,id);
assert.equal(h.play([10000,150,10000]).truncated,true);
assert.equal(calls.at(-1).reduce((a,b)=>a+b,0),15000);
assert.equal(sanitizePattern([130000])[0],120000);
h.deleteNamed(id);
assert.equal(h.config.groups.confirmation,"off");
assert.equal(JSON.parse(h.export()).schema,"MobiLab.HapticProfiles.v2");

const {compileSteps,patternToSteps}=load("src/pattern-editor.js",["compileSteps","patternToSteps"],{});
assert.equal(JSON.stringify(compileSteps([{kind:"off",ms:100},{kind:"on",ms:350},{kind:"on",ms:50},{kind:"off",ms:200}])),
  JSON.stringify([0,100,400,200]));
assert.equal(patternToSteps([200,80,500])[1].kind,"off");
assert.equal(JSON.stringify(compileSteps([{kind:"on",ms:0},{kind:"off",ms:0}])),JSON.stringify([]));

const {SettingsStore,normalizeSettings}=load("src/mechanics/settings-store.js",["SettingsStore","normalizeSettings"]);
const config=new SettingsStore(),observations=[];
const unsubscribe=config.subscribe(next=>observations.push(next.layout));
config.set({layout:"bottom",panelSize:5,blur:500,tabs:[]});
assert.equal(config.get().panelSize,25);
assert.equal(config.get().blur,40);
assert.equal(config.get().tabs.length,4);
assert.equal(observations.at(-1),"bottom");
const snapshot=config.export();
const restored=new SettingsStore();restored.import(snapshot);
assert.equal(restored.get().layout,"bottom");
assert.throws(()=>restored.import({schema:"unknown"}),/Unrecognized/);
unsubscribe();config.set({layout:"full"});assert.equal(observations.length,2);

function element(){
  const attrs={},listeners={},classes=new Set(),style={};
  return {
    dataset:{},style:{setProperty:(k,v)=>{style[k]=v}},className:"",textContent:"",disabled:false,
    children:[],
    classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:(n,value)=>value?classes.add(n):classes.delete(n)},
    append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs},
    addEventListener:(n,fn)=>{listeners[n]=fn},removeEventListener:(n)=>{delete listeners[n]},
    setAttribute:(k,v)=>{attrs[k]=v},getBoundingClientRect:()=>({left:0,top:0,width:300,height:300})
  };
}
const fakeDoc={createElement:()=>element()};
const {FixedMenuDial}=load("src/mechanics/fixed-menu-dial.js",["FixedMenuDial"],{document:fakeDoc});
const dialRoot=element();
const selected=[];
const dial=new FixedMenuDial({root:dialRoot,items:["A","B","C","D","E","F","G"],onChange:(item,i)=>selected.push(i)});
assert.equal(dial.buttons.length,6);
assert.equal(dialRoot.children.length,7);
const places=dial.buttons.map(b=>b.style.left+" / "+b.style.top);
dial.step(1);dial.step(6);
assert.equal(dial.selected,0);
assert.equal(JSON.stringify(dial.buttons.map(b=>b.style.left+" / "+b.style.top)),JSON.stringify(places));
dial.select(6);assert.equal(dial.buttons[0].textContent,"G");
dial.destroy();assert.equal(dialRoot.children.length,0);
console.log("MobiLab modular mechanics: ALL TESTS PASSED");
