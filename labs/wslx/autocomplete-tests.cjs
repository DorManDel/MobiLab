const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const path=require('node:path');
const ctx={window:{},console,Date};vm.createContext(ctx);
for(const part of ['terminal-engine','commands-linux','commands-wslx','autocomplete']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'src',part+'.js'),'utf8'),ctx,{filename:part+'.js'});
}
const lab=ctx.window.WSLXLab,engine=new lab.TerminalEngine();lab.installLinux(engine);lab.installWSLX(engine);
const S=(text,pos)=>lab.Autocomplete.suggest(engine,text,pos);
function check(prefix,match){const a=S(prefix);assert(a.items.some(x=>x.value===match),`${prefix} expected ${match}; got ${a.items.map(x=>x.value)}`);console.log('✓',prefix,'→',match);}
function finish(command,target){const a=S(command);const item=a.items.find(x=>x.value===target);assert(item,command+' lacks '+target);return a.apply(item).text;}
check('wsl','wslx');check('w','wcd');check('wslx pa','path');check('wslx --wi','--win');check('git st','status');
check('cd proj','projects');check('wcd D:\\Projects\\D','D:\\Projects\\Demo');
check('wslx cd "D:\\Projects\\D','D:\\Projects\\Demo');
check('wslx --win /mnt/d/Pro','/mnt/d/Projects');
check('cat README','README.txt');
check('wslx path --w','--win');
check('cd ~','~');
check('cd -','-');
assert(!S('cd proj').items.some(x=>x.kind==='file'));
assert.equal(finish('wsl','wslx'),'wslx ');
assert.equal(finish('cd proj','projects'),'cd projects/');
assert.equal(finish('wcd D:\\Projects\\D','D:\\Projects\\Demo'),'wcd D:\\Projects\\Demo\\');
assert.equal(lab.parseWords(finish('wslx cd "D:\\Projects\\D','D:\\Projects\\Demo'))[2],'D:\\Projects\\Demo\\');
engine.fs.addDir('/home/dor/folder with spaces');
assert.equal(finish('cd fol','folder with spaces'),'cd folder\\ with\\ spaces/');
assert.equal(finish('cd "fol','folder with spaces'),'cd "folder with spaces/"');
engine.fs.addFile('/home/dor/new-name.txt','hello');
check('cat new','new-name.txt');
assert.equal(finish('cat new','new-name.txt'),'cat new-name.txt ');
// Completing at the cursor must preserve the text to the right.
const t='cat new --later';const pos=t.indexOf(' --');const a=S(t,pos);
const f=a.apply(a.items.find(x=>x.value==='new-name.txt'),t,pos);
assert.equal(f.text,'cat new-name.txt --later');
// Changes made in the Explorer are reflected in the command registry immediately.
engine.fs.addDir('/home/dor/special');check('cd spec','special');
engine.fs.move('/home/dor/special','/home/dor/renamed');assert(!S('cd spec').items.some(x=>x.value==='special'));check('cd ren','renamed');
console.log('Autocomplete R0.4 tests passed');