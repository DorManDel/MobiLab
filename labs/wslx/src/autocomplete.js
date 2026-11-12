/*
 * WSLXLab completion engine R0.4.
 * Pure, safe suggestions from registered command metadata + virtual FS only.
 * No OS access, network requests or shell execution.
 */
(function (global) {
  'use strict';
  const lab = global.WSLXLab = global.WSLXLab || {};
  const WSLX_CURRENT = ['help','path','cd','doctor','version','--wsl','--win','--link','--help','--version'];
  const WSLX_PLANNED = ['open','reveal','clip','paste','code','info','drives','ports','kill-port'];
  const GIT = ['status','remote','branch','--version'];
  const PATH_COMMANDS = new Set(['cd','wcd','ls','tree','cat','touch','mkdir','rm','wopen','wreveal','wcode']);
  const FOLDERS_ONLY = new Set(['cd','wcd']);

  function lex(text, position=text.length) {
    const src=String(text).slice(0,Math.max(0,Math.min(text.length,position)));
    const tokens=[];
    let word=null, quote=null;
    const begin=(i)=>{if(!word)word={start:i,value:'',quote:null};};
    const push=()=>{if(word){word.end=src.length;tokens.push(word);word=null;}};
    for(let i=0;i<src.length;i++){
      const c=src[i],n=src[i+1];
      if(quote){
        if(c===quote){quote=null;continue;}
        if(quote==='"'&&c==='\\'&&n&&['\\','"','$','`'].includes(n)){word.value+=n;i++;continue;}
        word.value+=c;continue;
      }
      if(/\s/.test(c)){push();continue;}
      begin(i);
      if(c==='"'||c==="'"){if(!word.value&&!word.quote)word.quote=c;quote=c;}
      else if(c==='\\'&&n&&/[\s'"\\]/.test(n)&&!(/^[A-Za-z]:/.test(word.value))){word.value+=n;i++;}
      else word.value+=c;
    }
    push();
    if(!tokens.length||(/\s/.test(src.slice(-1))&&!quote))tokens.push({start:src.length,end:src.length,value:'',quote:null});
    const active=tokens[tokens.length-1];
    return {tokens,active,start:active.start,end:src.length,quote,source:src};
  }
  function encode(value,kind,rawQuote,existingText='') {
    // Keep unclosed quotes unclosed for directory traversal; close for complete files.
    const slash=kind==='directory'?(value.includes('\\')&&/^[A-Za-z]:/.test(value)?'\\':'/') : '';
    let text=value;
    if(kind==='directory'&&!text.endsWith('/')&&!text.endsWith('\\'))text+=slash;
    if(rawQuote==='"')return '"'+text.replace(/["\\]/g,'\\$&')+(kind==='partial'?'':'"');
    if(rawQuote==="'")return "'"+text.replace(/'/g,"'\\''")+(kind==='partial'?'':"'");
    if(/\s/.test(text)&&/^[A-Za-z]:[\\/]/.test(text))return "'"+text.replace(/'/g,"'\\''")+"'";
    return text.replace(/[\s'"\t]/g,c=>'\\'+c);
  }
  function commonPrefix(values) {
    if(!values.length)return '';
    let s=values[0];
    for(const value of values.slice(1)){
      while(!value.startsWith(s))s=s.slice(0,-1);
      if(!s)break;
    }
    return s;
  }
  function scanPath(engine,prefix,foldersOnly) {
    const isWindows=/^[A-Za-z]:[\\/]/.test(prefix);
    const slash=Math.max(prefix.lastIndexOf('/'),isWindows?prefix.lastIndexOf('\\'):-1);
    const base=slash>=0?prefix.slice(0,slash+1):'';
    const fragment=slash>=0?prefix.slice(slash+1):prefix;
    const parent=base||'.';
    const parentPath=engine.path(parent);
    if(engine.fs.get(parentPath)?.kind!=='dir')return [];
    return engine.fs.children(parentPath)
      .filter(x=>(!foldersOnly||x.kind==='dir')&&x.name.startsWith(fragment))
      .map(x=>({value:base+x.name,kind:x.kind==='dir'?'directory':'file',label:x.name+(x.kind==='dir'?'/':''),detail:x.kind==='dir'?'Virtual directory':'Virtual file'}));
  }
  function suggest(engine,text,position=String(text).length) {
    const part=lex(String(text),position),tokens=part.tokens,active=part.active;
    const prefix=active.value,head=tokens[0]?.value||'';
    const first=tokens.length===1;
    let results=[],context='path';
    if(first){
      context='command';
      results=[...engine.commands.keys()].filter(x=>x.toLowerCase().startsWith(prefix.toLowerCase()))
        .sort((a,b)=>a.localeCompare(b)).map(name=>({value:name,kind:'command',label:name,detail:engine.commands.get(name)?.description||'Command'}));
    } else if(head==='wslx') {
      // wslx with no subcommand, or typing a subcommand/flag.
      const before=tokens.slice(1,-1).map(t=>t.value);
      const firstArg=tokens.length===2;
      const isPath=/^[A-Za-z]:[\\/]/.test(prefix)||/^[/~.]/.test(prefix)||active.quote;
      if(firstArg&&!isPath){
        context='subcommand';
        results=[...WSLX_CURRENT,...WSLX_PLANNED].filter(x=>x.startsWith(prefix))
          .map(x=>({value:x,kind:'subcommand',label:x,detail:WSLX_PLANNED.includes(x)?'Planned · preview':'Current WSLX syntax'}));
        if(prefix==='')results=results.filter(x=>!WSLX_PLANNED.includes(x.value));
      } else if(before.includes('path') && prefix.startsWith('-')) {
        context='option';
        results=['--win','--wsl','--link','--help'].filter(x=>x.startsWith(prefix)).map(x=>({value:x,kind:'option',label:x,detail:'WSLX path option'}));
      } else if(before.includes('cd')&&prefix==='-') {
        context='path';results=[{value:'-',kind:'special',label:'-',detail:'Previous directory'}];
      } else {
        results=scanPath(engine,prefix,before.includes('cd'));
      }
    } else if(head==='git'&&tokens.length===2){
      context='subcommand';results=GIT.filter(x=>x.startsWith(prefix)).map(x=>({value:x,kind:'subcommand',label:x,detail:'Git demo command'}));
    } else if(PATH_COMMANDS.has(head)){
      if((head==='cd'||head==='wcd')&&prefix==='-')results=[{value:'-',kind:'special',label:'-',detail:'Previous directory'}];
      else if(head==='cd'&&prefix==='~')results=[{value:'~',kind:'special',label:'~',detail:'Home directory'},{value:'~/',kind:'directory',label:'~/',detail:'Home directory paths'}];
      else if(head==='mkdir'&&prefix==='-')results=[{value:'-p',kind:'option',label:'-p',detail:'Make parents'}];
      else if(head==='ls'&&prefix==='-')results=[{value:'-a',kind:'option',label:'-a',detail:'Include hidden files'}];
      else results=scanPath(engine,prefix,FOLDERS_ONLY.has(head));
    } else if(head==='which'||head==='command'){
      context='command';results=[...engine.commands.keys()].filter(x=>x.startsWith(prefix)).map(x=>({value:x,kind:'command',label:x,detail:'Registered command'}));
    }
    results=results.slice(0,120);
    const rawActive=part.source.slice(part.start,part.end);
    return {
      context, prefix, count:results.length, items:results,
      common:commonPrefix(results.map(x=>x.value)),
      start:part.start,end:part.end,
      apply(item, original=String(text), caret=position) {
        const before=original.slice(0,part.start), after=original.slice(caret);
        const encoded=encode(item.value,item.kind,active.quote,rawActive);
        let insertion=encoded;
        // Leave a separator when a command, option or file token is complete.
        if(!active.quote&&item.kind!=='directory'&&item.kind!=='partial'&&!after.startsWith(' ')&&!insertion.endsWith(' '))insertion+=' ';
        return {text:before+insertion+after,cursor:before.length+insertion.length};
      }
    };
  }
  lab.Autocomplete={lex,suggest,commonPrefix};
})(window);