/* Terminal renderer and keyboard UX. No dependency on project-modal code. */
(function(global){
  'use strict';
  const $=id=>document.getElementById(id);
  const lab=global.WSLXLab;
  const engine=new lab.TerminalEngine();
  lab.installLinux(engine);lab.installWSLX(engine);
  // Example of how easily any future addon can be plugged into the engine:
  engine.register({name:'about',section:'Demo',status:'simulated',description:'Learn how this browser preview works',handler:ctx=>{
    ctx.print('WSLX LAB · Browser-only emulator','title');
    ctx.print('Commands are dispatched to JavaScript functions.');
    ctx.print('Paths and files live in an in-memory virtual filesystem.');
    ctx.print('There is no shell execution, web service, GitHub write, or real device access.','warning');
    ctx.print('See README.md for the plugin registration API.','accent');
  }});
  const output=$('output'),input=$('terminalInput'),form=$('terminalForm'),term=$('terminal');
  const status=$('status'),promptLabel=$('promptLabel');
  let historyIndex=-1, historyDraft='', executed=0, busy=false;
  const maxEntries=220;
  const esc=(s)=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function scrollEnd(){output.scrollTop=output.scrollHeight;}
  function prompt(){
    const display=engine.displayPath();
    promptLabel.textContent='';promptLabel.append(document.createTextNode(engine.username+'@'+engine.hostname+':'));
    const path=document.createElement('b');path.textContent=display;promptLabel.append(path,document.createTextNode('$'));
    $('titlePath').textContent=engine.username+'@'+engine.hostname+':'+display;
  }
  function banner(){
    const el=document.createElement('div');el.className='welcome';
    const title=document.createElement('div');title.className='welcome-title';title.textContent='Ubuntu / WSLX · Interactive Demo';
    const desc=document.createElement('div');desc.className='welcome-desc';desc.textContent='Ready. Type help or wslx help to explore. This is a safe, simulated shell — no real commands run.';
    el.append(title,desc);output.append(el);
  }
  function logCommand(command,promptString){
    const entry=document.createElement('div');entry.className='log-entry';
    const row=document.createElement('div');row.className='prompt-display';
    const idx=promptString.indexOf(':');
    const host=document.createElement('span');host.className='host';host.textContent=promptString.slice(0,idx+1);
    const path=document.createElement('span');path.className='path';path.textContent=promptString.slice(idx+1,-1);
    const cmd=document.createElement('span');cmd.className='cmd';cmd.textContent='$ '+command;
    row.append(host,path,cmd);entry.append(row);output.append(entry);
    return entry;
  }
  function logLines(entry,lines){
    const holder=document.createElement('div');holder.className='log-lines';
    const fragment=document.createDocumentFragment();
    for(const l of lines){const div=document.createElement('div');div.className='log-line '+(l.tone||'normal');div.textContent=l.text;fragment.append(div);}
    holder.append(fragment);entry.append(holder);
    while(output.children.length>maxEntries)output.removeChild(output.firstElementChild);
  }
  function setStatus(s){status.textContent=s;}
  async function run(text){
    if(busy)return;
    const command=String(text).trim();if(!command){input.focus();return;}
    const wasNearEnd=output.scrollHeight-output.scrollTop-output.clientHeight<100;
    const oldPrompt=engine.prompt();const entry=logCommand(command,oldPrompt);
    busy=true;form.querySelector('button').disabled=true;input.disabled=true;
    let res;
    try{res=await engine.execute(command);}catch(e){res={lines:[{text:'Unexpected sandbox error: '+e.message,tone:'error'}],code:1,prompt:engine.prompt()};}
    if(res.clear){output.replaceChildren();banner();}
    else logLines(entry,res.lines);
    input.value='';historyIndex=-1;historyDraft='';executed++;$('sessionCount').textContent=String(executed);
    prompt();setStatus(res.code===0?'Sandbox ready · exit 0':'Sandbox ready · exit '+res.code);
    input.disabled=false;form.querySelector('button').disabled=false;busy=false;
    if(wasNearEnd)scrollEnd();
    // Avoid opening the virtual keyboard when quick buttons are tapped on mobile.
    if(document.activeElement===input || !matchMedia('(pointer:coarse)').matches)input.focus({preventScroll:true});
  }
  function complete(){
    const raw=input.value,pos=input.selectionStart??raw.length;
    if(pos!==raw.length)return;
    const words=raw.trimStart().split(/\s+/);
    if(words.length===1){
      const prefix=words[0].toLowerCase();const matches=[...engine.commands.keys()].filter(k=>k.startsWith(prefix));
      if(matches.length===1)input.value=matches[0]+' ';
      else if(matches.length>1)setStatus('Matches: '+matches.slice(0,10).join('  '));
      return;
    }
    const last=words[words.length-1];
    const slash=last.lastIndexOf('/');const parent=slash<0?'.':last.slice(0,slash)||'/';
    const basename=slash<0?last:last.slice(slash+1);
    const folder=engine.fs.get(engine.path(parent));if(folder?.kind!=='dir')return;
    const matches=engine.fs.children(engine.path(parent)).filter(f=>f.name.startsWith(basename));
    if(matches.length===1){const f=matches[0];const next=(slash<0?'':last.slice(0,slash+1))+f.name+(f.kind==='dir'?'/':' ');input.value=raw.slice(0,raw.length-last.length)+next;}
    else if(matches.length>1)setStatus('Matches: '+matches.map(x=>x.name).join('  '));
  }
  form.addEventListener('submit',e=>{e.preventDefault();run(input.value);});
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowUp'){
      e.preventDefault();if(!engine.history.length)return;
      if(historyIndex===-1){historyDraft=input.value;historyIndex=engine.history.length-1;}
      else historyIndex=Math.max(0,historyIndex-1);
      input.value=engine.history[historyIndex];input.setSelectionRange(input.value.length,input.value.length);
    }
    else if(e.key==='ArrowDown'){
      e.preventDefault();if(historyIndex===-1)return;
      historyIndex++;input.value=historyIndex>=engine.history.length?(historyIndex=-1,historyDraft):engine.history[historyIndex];
    }
    else if(e.key==='Tab'){e.preventDefault();complete();}
    else if(e.ctrlKey&&(e.key.toLowerCase()==='l')){e.preventDefault();output.replaceChildren();banner();setStatus('Display cleared');}
    else if(e.ctrlKey&&(e.key.toLowerCase()==='c')){e.preventDefault();input.value='';setStatus('^C · input canceled');}
  });
  document.querySelectorAll('[data-command]').forEach(el=>el.addEventListener('click',()=>run(el.dataset.command)));
  $('clearBtn').addEventListener('click',()=>{output.replaceChildren();banner();setStatus('Display cleared');});
  $('resetBtn').addEventListener('click',()=>{engine.reset();executed=0;$('sessionCount').textContent='0';historyIndex=-1;input.value='';output.replaceChildren();banner();prompt();setStatus('Virtual filesystem reset');});
  $('expandBtn').addEventListener('click',()=>{
    const on=term.classList.toggle('is-expanded');$('expandBtn').textContent=on?'Close ↙':'Expand ↗';$('expandBtn').setAttribute('aria-label',on?'Close expanded terminal':'Expand terminal');
    document.body.style.overflow=on?'hidden':'';
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&term.classList.contains('is-expanded'))$('expandBtn').click();});
  $('copyBtn').addEventListener('click',async()=>{
    const transcript=[...output.querySelectorAll('.welcome-title,.welcome-desc,.prompt-display,.log-line')].map(x=>x.textContent).join('\n');
    try{await navigator.clipboard.writeText(transcript);setStatus('Terminal transcript copied');}
    catch{setStatus('Clipboard unavailable in this browser or file:// context');}
  });
  $('commandCount').textContent=engine.commandMeta.size;
  banner();prompt();scrollEnd();
  global.WSLXLab.engine=engine;
  global.WSLXLab.run=run;
  global.WSLXLab.refreshTerminal=()=>{prompt();setStatus('Virtual workspace updated');};
})(window);