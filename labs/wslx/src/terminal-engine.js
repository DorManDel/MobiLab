/*
 * WSLX Terminal Lab - browser-only command engine, R0.1.
 * Public API: window.WSLXLab.TerminalEngine
 * No eval, exec, network requests, shell spawning, or access to host files.
 * The virtual filesystem is RAM-only and is reset on reload / Reset Demo.
 */
(function (global) {
  'use strict';
  const S = global.WSLXLab = global.WSLXLab || {};
  const line = (text, tone='normal') => ({text: String(text), tone});
  const posixNormalize = input => {
    const pieces = [];
    for (const p of String(input).split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') pieces.pop();
      else pieces.push(p);
    }
    return '/' + pieces.join('/');
  };
  const isWin = s => /^[a-z]:[\\/]/i.test(String(s));
  function parseWords(input) {
    const out = []; let word = '', started = false, mode = 'normal';
    const s = String(input);
    for (let i=0; i<s.length; i++) {
      const ch=s[i], next=s[i+1];
      if (mode==='single') {
        if (ch==="'") mode='normal'; else word+=ch;
        continue;
      }
      if (mode==='double') {
        if (ch==='"') { mode='normal'; continue; }
        if (ch==='\\' && ['\\','"','$','`'].includes(next)) {word+=next;i++;continue;}
        word+=ch; continue;
      }
      if (/\s/.test(ch)) {
        if (started) {out.push(word); word=''; started=false;}
      } else if (ch==="'") {mode='single';started=true;}
      else if (ch==='"') {mode='double';started=true;}
      else if (ch==='\\' && next && /[\s'"\\]/.test(next) && !isWin(word)) {word+=next;i++;started=true;}
      else {word+=ch;started=true;}
    }
    if (mode!=='normal') throw new Error('unexpected EOF while looking for matching quote');
    if (started) out.push(word);
    return out;
  }
  class VirtualFS {
    constructor() { this.entries = new Map(); this.seed(); }
    addDir(p) {
      p=posixNormalize(p);
      const parts=p.split('/').filter(Boolean);
      this.entries.set('/', {kind:'dir'});
      let at='';
      for(const part of parts) {at += '/' + part;if(!this.entries.has(at)) this.entries.set(at,{kind:'dir'});}
    }
    addFile(p,content='') {
      p=posixNormalize(p); this.addDir(p.slice(0,p.lastIndexOf('/')) || '/');
      this.entries.set(p,{kind:'file',content:String(content)});
    }
    get(p){return this.entries.get(posixNormalize(p));}
    children(p){p=posixNormalize(p);const prefix=p==='/'?'/':p+'/';return [...this.entries].filter(([key])=>key.startsWith(prefix) && key!==p && !key.slice(prefix.length).includes('/')).map(([name,item])=>({name:name.slice(prefix.length), ...item})).sort((a,b)=>Number(b.kind==='dir')-Number(a.kind==='dir') || a.name.localeCompare(b.name));}
    remove(p){p=posixNormalize(p);if(p==='/')return false;const item=this.get(p);if(!item)return false;for(const key of this.entries.keys())if(key===p||key.startsWith(p+'/'))this.entries.delete(key);return true;}
    seed(){
      this.entries.clear();
      const dirs=['/home/dor','/home/dor/projects/wslx/bin','/home/dor/projects/wslx/commands','/home/dor/projects/wslx/docs','/home/dor/projects/myportfolio','/home/dor/downloads','/mnt/c/Users/Dor/Projects','/mnt/d/Projects/Demo','/etc','/usr/local/bin','/tmp'];
      dirs.forEach(p=>this.addDir(p));
      this.addFile('/home/dor/README.txt','Welcome to a browser-only Ubuntu/WSLX demo.\n\nStart with: wslx help\nTry:       wslx "D:\\Projects\\Demo"\nExplore:   cd projects/wslx && ls  (run each command separately)\n\nNo real commands are executed.');
      this.addFile('/home/dor/projects/wslx/README.md','# WSLX\nSmall command-line tools for moving cleanly between Windows and WSL.\n\nCurrent: path conversion, cd/wcd, doctor, version.\nPlanned: open, clip, paste, code, diagnostics and more.\n\nSource: github.com/DorManDel/wslx');
      this.addFile('/home/dor/projects/wslx/VERSION','0.1.0-dev');
      this.addFile('/home/dor/projects/wslx/bin/wslx','#!/usr/bin/env bash\n# WSLX CLI dispatcher - abbreviated demo fixture.\n# Real source: github.com/DorManDel/wslx');
      this.addFile('/home/dor/projects/wslx/commands/path.sh','# Real WSLX converts paths with wslpath.\n# This browser preview mimics supported path forms.');
      this.addFile('/home/dor/projects/wslx/docs/COMMANDS.md','# Commands\npath, cd, doctor, version, help');
      this.addFile('/home/dor/projects/myportfolio/README.md','# MyPortfolio\nInteractive project gallery and frontend experiments.');
      this.addFile('/home/dor/projects/myportfolio/index.html','<!doctype html>\n<title>MyPortfolio demo fixture</title>');
      this.addFile('/mnt/d/Projects/Demo/README.md','# Demo project\nUse WSLX to jump between Windows and Linux paths.');
      this.addFile('/mnt/d/Projects/Demo/app.js','console.log("Hello from the virtual demo!");');
      this.addFile('/mnt/c/Users/Dor/Projects/notes.txt','All files here are virtual. The Windows drive is simulated.');
      this.addFile('/etc/os-release','NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04 LTS (SIMULATED)"\nID=ubuntu');
    }
  }
  class TerminalEngine {
    constructor(options={}) {
      this.username=options.username || 'dor';this.hostname=options.hostname || 'ubuntu';
      this.home='/home/'+this.username;this.fs=new VirtualFS();
      this.cwd=this.home;this.history=[];this.env={HOME:this.home,USER:this.username,PWD:this.home,OLDPWD:'',SHELL:'/bin/bash',TERM:'xterm-256color'};
      this.commands=new Map();this.commandMeta=new Map();this.clipboard='';this.lastCode=0;
    }
    reset(){this.cwd=this.home;this.history=[];this.fs.seed();this.clipboard='';this.lastCode=0;this.env.PWD=this.home;this.env.OLDPWD='';}
    register({name,aliases=[],description='',section='Addon',handler,status='demo'}) {
      if(typeof name!=='string'||!name.trim()||typeof handler!=='function') throw new TypeError('register requires a name and handler');
      const meta={name,aliases,description,section,status,handler};
      for(const key of [name,...aliases]) {
        if(this.commands.has(key)) throw new Error('Command already registered: '+key);
        this.commands.set(key,meta);
      }
      this.commandMeta.set(name,meta);
      return this;
    }
    path(input='.'){
      const s=String(input||'.');
      let value=s;
      if(isWin(value)) value='/mnt/'+value[0].toLowerCase()+value.slice(2).replace(/\\/g,'/');
      if(value==='~'||value.startsWith('~/'))value=this.home+value.slice(1);
      if(!value.startsWith('/'))value=this.cwd+'/'+value;
      return posixNormalize(value);
    }
    toWSL(input){const s=String(input);return isWin(s)?'/mnt/'+s[0].toLowerCase()+s.slice(2).replace(/\\/g,'/'):s;}
    toWindows(input){
      const p=this.path(input);
      const match=/^\/mnt\/([a-z])(?:\/(.*))?$/i.exec(p);
      if(match)return match[1].toUpperCase()+':\\'+(match[2]||'').replace(/\//g,'\\');
      return '\\\\wsl.localhost\\Ubuntu'+p.replace(/\//g,'\\');
    }
    displayPath(){return this.cwd===this.home?'~':this.cwd.startsWith(this.home+'/')?'~'+this.cwd.slice(this.home.length):this.cwd;}
    prompt(){return `${this.username}@${this.hostname}:${this.displayPath()}$`;}
    listCommands(){return [...this.commandMeta.values()].map(({name,aliases,description,section,status})=>({name,aliases,description,section,status}));}
    async execute(input,options={}) {
      const raw=String(input).trim(), lines=[];
      const print=(text='',tone='normal')=>{String(text).split('\n').forEach(t=>lines.push(line(t,tone)));};
      if(!raw)return {lines,code:0,prompt:this.prompt(),clear:false,empty:true};
      if(!options.skipHistory)this.history.push(raw);
      let args;
      try {args=parseWords(raw);}catch(e){print('bash: '+e.message,'error');return {lines,code:2,prompt:this.prompt()};}
      if(!args.length)return {lines,code:0,prompt:this.prompt()};
      const [name,...rest]=args;
      if(name.includes('&&') || raw.includes(' && ') || raw.includes(' | ') || raw.includes(';')) {
        print('This demo accepts one command at a time. Pipes, chains and shell scripts are not supported.','warning');
        return {lines,code:2,prompt:this.prompt()};
      }
      const cmd=this.commands.get(name);
      if(!cmd){print(`${name}: command not found. Type 'help' or 'wslx help'.`,'error');this.lastCode=127;return {lines,code:127,prompt:this.prompt()};}
      let code=0,clear=false;
      const ctx={engine:this,args:rest,raw,print,fs:this.fs,
        resolve:p=>this.path(p),toWSL:p=>this.toWSL(p),toWindows:p=>this.toWindows(p),
        get cwd(){return this.engine.cwd;},
        changeDirectory:(p)=>{const request=p==='-'?this.env.OLDPWD:p;if(!request)throw new Error('OLDPWD not set');const next=this.path(request);const entry=this.fs.get(next);if(!entry)throw new Error('No such file or directory: '+p);if(entry.kind!=='dir')throw new Error('Not a directory: '+p);this.env.OLDPWD=this.cwd;this.cwd=next;this.env.PWD=next;return next;},
        clear:()=>{clear=true;}
      };
      try {
        const result=await cmd.handler(ctx);
        if(typeof result==='string')print(result);
        if(typeof result==='number')code=result;
        if(result && typeof result==='object' && !Array.isArray(result)) {
          if('code'in result) code=result.code;
          if('clear'in result) clear=Boolean(result.clear);
          if(result.lines)for(const l of result.lines)print(l.text,l.tone);
        }
      }catch(e){print(`${name}: ${e.message}`,'error');code=1;}
      this.lastCode=code;
      return {lines,code,clear,prompt:this.prompt(),empty:false};
    }
  }
  S.TerminalEngine=TerminalEngine;
  S.VirtualFS=VirtualFS;
  S.parseWords=parseWords;
})(window);