import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SettingsRegistry, SettingsStore, registerDefaultModules, CONFETTI_MODULE, LAYOUTS} from '../labs/settings/engine.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('MobiLab tab and route are wired',()=>{
  const html=read('index.html');
  assert.match(html,/href="\.\/labs\/settings\/"/);
  assert.match(html,/Settings Layout Lab/);
  for(const file of ['index.html','settings.js','settings.css','engine.js','README.md']){
    assert.ok(fs.statSync(path.join(root,'labs/settings',file)).size>100);
  }
});
test('Settings modules have unique ids and valid schema',()=>{
  const registry=new SettingsRegistry();
  registerDefaultModules(registry);
  assert.equal(registry.list().length,5);
  assert.deepEqual(LAYOUTS,['corner','top','side','bottom','custom']);
  assert.throws(()=>registry.registerModule(registry.list()[0]),/unique/);
  registry.registerModule(CONFETTI_MODULE);
  assert.equal(registry.list().length,6);
  registry.unregisterModule('confetti');
  assert.equal(registry.list().length,5);
  assert.throws(()=>registry.unregisterModule('access'),/cannot be removed/);
});
test('Layout and named Custom preset serialize with safe bounds',()=>{
  const registry=new SettingsRegistry();registerDefaultModules(registry);
  const memory=new Map();
  globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))};
  const s=new SettingsStore(registry,'test.settings');
  s.setLayout('custom');s.set('prism','strength',999);
  assert.equal(s.get('prism','strength'),100);
  s.saveCustom('My Custom',{x:2,y:-5,w:.6,h:.8});
  const copy=new SettingsStore(registry,'test.settings');
  assert.equal(copy.state.layout,'custom');
  assert.equal(copy.state.customPresets[0].name,'My Custom');
  assert.equal(copy.state.customPresets[0].geometry.x,1);
  assert.equal(copy.state.customPresets[0].geometry.y,0);
  assert.equal(copy.get('prism','strength'),100);
});
test('Original source preview is sandboxed and does not grant same-origin',()=>{
 const html=read('labs/settings/index.html');
 assert.match(html,/sandbox="allow-scripts allow-forms"/);
 assert.doesNotMatch(html,/allow-same-origin/);
 const js=read('labs/settings/settings.js');
 assert.match(js,/postMessage/);
 assert.match(js,/settings-panel/);
});
test('Pinned MyPortfolio inventory matches 16 original groups and source commit',()=>{
  const data=JSON.parse(read('labs/settings/myportfolio-settings-inventory.json'));
  assert.equal(data.source.commit,'e13f57e3dbfb116003e705df89ce13fa00cfaf6a');
  assert.equal(data.summary.groups,16);
  assert.equal(data.summary.controls_in_settings_panel,72);
  assert.ok(data.groups.some(g=>g.id==='wp3-ripple-settings'));
  assert.ok(data.groups.some(g=>g.id==='dev-carousel-sound'));
});
test('Independent scripts parse',()=>{
 for(const file of ['labs/settings/engine.js','labs/settings/settings.js']){
  const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
 }
});
