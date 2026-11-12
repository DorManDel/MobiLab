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
  const status=$('status'),promptLabel=$('promptLabel'),suggestions=$('completionList');
  const tabBtn=$('tabBtn'),enterBtn=$('enterBtn');
  let completionCycle=null,showingSuggestions=false;
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
    busy=true;enterBtn.disabled=true;tabBtn.disabled=true;input.disabled=true;hideSuggestions();completionCycle=null;
    let res;
    try{res=await engine.execute(command);}catch(e){res={lines:[{text:'Unexpected sandbox error: '+e.message,tone:'error'}],code:1,prompt:engine.prompt()};}
    if(res.clear){output.replaceChildren();banner();}
    else logLines(entry,res.lines);
    input.value='';historyIndex=-1;historyDraft='';executed++;$('sessionCount').textContent=String(executed);
    prompt();setStatus(res.code===0?'Sandbox ready · exit 0':'Sandbox ready · exit '+res.code);
    input.disabled=false;enterBtn.disabled=false;tabBtn.disabled=false;busy=false;
    if(wasNearEnd)scrollEnd();
    // Avoid opening the virtual keyboard when quick buttons are tapped on mobile.
    if(document.activeElement===input || !matchMedia('(pointer:coarse)').matches)input.focus({preventScroll:true});
  }
  function hideSuggestions(){suggestions.replaceChildren();suggestions.hidden=true;showingSuggestions=false;}
  function applyMatch(result,item,source=input.value,caret=input.selectionStart??input.value.length){
    const next=result.apply(item,source,caret);
    input.value=next.text;
    input.setSelectionRange(next.cursor,next.cursor);
  }
  function renderSuggestions(result=null,highlight=-1){
    if(!result){
      if(!input.value.trim()||busy){hideSuggestions();return;}
      result=lab.Autocomplete.suggest(engine,input.value,input.selectionStart??input.value.length);
    }
    suggestions.replaceChildren();
    if(!result.count){hideSuggestions();return;}
    const head=document.createElement('div');head.className='completion-head';
    head.textContent=`${result.count} ${result.context==='path'?'virtual path':'command'} match${result.count===1?'':'es'} · Tab to complete · Tap to select`;
    suggestions.append(head);
    for(const [i,item] of result.items.slice(0,8).entries()){
      const option=document.createElement('button');option.type='button';option.className='completion-option';
      option.setAttribute('role','option');option.setAttribute('aria-selected',i===highlight?'true':'false');
      option.title=item.detail;
      option.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||event.pointerType==='touch')event.preventDefault();});
      option.addEventListener('click',()=>{
        applyMatch(result,item);
        completionCycle=null;renderSuggestions();
        input.focus({preventScroll:true});
        setStatus(`Completed ${item.kind}: ${item.value}`);
      });
      const label=document.createElement('span');label.className='completion-label';label.textContent=item.label;
      const kind=document.createElement('small');kind.className='completion-kind';kind.textContent=item.kind==='directory'?'DIR':item.kind==='file'?'FILE':item.kind==='option'?'FLAG':item.kind==='command'?'CMD':item.kind==='subcommand'?'WSLX':'PATH';
      option.append(label,kind);suggestions.append(option);
    }
    if(result.count>8){const more=document.createElement('div');more.className='completion-more';more.textContent=`+ ${result.count-8} additional matches. Type more letters to narrow.`;suggestions.append(more);}
    suggestions.hidden=false;showingSuggestions=true;
  }
  function complete(backward=false){
    if(busy)return;
    // Continue cycling against the same base text, instead of treating a selected option as a new query.
    if(completionCycle){
      const c=completionCycle;
      c.index=(c.index+(backward?-1:1)+c.result.items.length)%c.result.items.length;
      applyMatch(c.result,c.result.items[c.index],c.base,c.caret);
      renderSuggestions(c.result,c.index);
      setStatus(`Match ${c.index+1}/${c.result.count} · Tab cycles, Enter runs`);
      return;
    }
    const caret=input.selectionStart??input.value.length;
    const result=lab.Autocomplete.suggest(engine,input.value,caret);
    if(!result.count){setStatus('No matching virtual commands or paths');hideSuggestions();return;}
    if(result.count===1){
      applyMatch(result,result.items[0]);renderSuggestions();setStatus('Completed '+result.items[0].kind);
      return;
    }
    // Common-prefix completion first, just like Bash.
    if(result.common.length>result.prefix.length){
      applyMatch(result,{value:result.common,kind:'partial'});
      renderSuggestions();setStatus(`${result.count} possible matches · press Tab again to cycle`);
      return;
    }
    const base=input.value;
    const index=backward?result.items.length-1:0;
    completionCycle={result,base,caret,index};
    applyMatch(result,result.items[index],base,caret);
    renderSuggestions(result,index);
    setStatus(`Match ${index+1}/${result.count} · Tab cycles, Enter runs`);
  }
  tabBtn.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||e.pointerType==='touch')e.preventDefault();});
  tabBtn.addEventListener('click',()=>{complete();input.focus({preventScroll:true});});
  input.addEventListener('input',()=>{completionCycle=null;renderSuggestions();});
  input.addEventListener('click',()=>{completionCycle=null;renderSuggestions();});
  input.addEventListener('compositionend',()=>{completionCycle=null;renderSuggestions();});
  form.addEventListener('submit',e=>{e.preventDefault();run(input.value);});
  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowUp'){
      e.preventDefault();if(!engine.history.length)return;
      if(historyIndex===-1){historyDraft=input.value;historyIndex=engine.history.length-1;}
      else historyIndex=Math.max(0,historyIndex-1);
      input.value=engine.history[historyIndex];input.setSelectionRange(input.value.length,input.value.length);completionCycle=null;renderSuggestions();
    }
    else if(e.key==='ArrowDown'){
      e.preventDefault();if(historyIndex===-1)return;
      historyIndex++;input.value=historyIndex>=engine.history.length?(historyIndex=-1,historyDraft):engine.history[historyIndex];completionCycle=null;renderSuggestions();
    }
    else if(e.key==='Tab'){e.preventDefault();complete(e.shiftKey);}
    else if(e.ctrlKey&&(e.key.toLowerCase()==='l')){e.preventDefault();output.replaceChildren();banner();setStatus('Display cleared');}
    else if(e.ctrlKey&&(e.key.toLowerCase()==='c')){e.preventDefault();input.value='';hideSuggestions();completionCycle=null;setStatus('^C · input canceled');}
    else if(e.key==='Escape'&&showingSuggestions){e.preventDefault();hideSuggestions();completionCycle=null;}
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
  global.WSLXLab.refreshTerminal=()=>{prompt();setStatus('Virtual workspace updated');if(showingSuggestions)renderSuggestions();};
})(window);