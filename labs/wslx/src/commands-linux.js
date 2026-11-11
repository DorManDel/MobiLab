/* Linux-like commands for the browser-only virtual filesystem. */
(function(global){
  'use strict';
  global.WSLXLab.installLinux = function(engine){
    const reg=(name,description,handler,aliases=[])=>engine.register({name,description,handler,aliases,section:'Linux',status:'simulated'});
    reg('help','Show available commands',ctx=>{
      ctx.print('AVAILABLE COMMANDS  ·  browser sandbox','title');
      ctx.print('');
      for(const m of ctx.engine.listCommands())ctx.print(m.name.padEnd(14)+m.description,'muted');
      ctx.print('');ctx.print('Try: wslx help  ·  wslx doctor  ·  ls  ·  cd projects/wslx','accent');
      ctx.print('Commands use a virtual filesystem, not your real OS.','warning');
    });
    reg('pwd','Print current virtual directory',ctx=>ctx.cwd);
    reg('cd','Move within virtual directories (cd -, cd ~)',ctx=>{const args=ctx.args[0]==='--'?ctx.args.slice(1):ctx.args;if(args.length>1){ctx.print('cd: too many arguments','error');return 2;}const target=args[0]||'~';const next=ctx.changeDirectory(target);if(target==='-')ctx.print(next);});
    reg('ls','List virtual files and folders',ctx=>{
      const args=ctx.args.filter(x=>!x.startsWith('-'));
      const target=ctx.resolve(args[0]||'.');const entry=ctx.fs.get(target);
      if(!entry)throw new Error('cannot access '+(args[0]||'.')+': No such file or directory');
      if(entry.kind==='file'){ctx.print(args[0]||target);return;}
      const items=ctx.fs.children(target).filter(x=>ctx.args.includes('-a')||!x.name.startsWith('.'));
      if(!items.length){ctx.print('(empty)','muted');return;}
      for(const f of items)ctx.print((f.kind==='dir'?'▸ ':'  ')+f.name+(f.kind==='dir'?'/':''),f.kind==='dir'?'accent':'normal');
    });
    reg('tree','Display virtual project tree',ctx=>{
      const root=ctx.resolve(ctx.args[0]||'.');if(!ctx.fs.get(root))throw new Error('No such file or directory: '+root);
      ctx.print(root,'title');let count=0;
      const visit=(p,indent='',depth=0)=>{
        if(depth>4||count>75)return;
        const children=ctx.fs.children(p);children.forEach((item,i)=>{
          if(count++>75)return;
          const branch=i===children.length-1?'└── ':'├── ';
          ctx.print(indent+branch+item.name+(item.kind==='dir'?'/':''),item.kind==='dir'?'accent':'normal');
          if(item.kind==='dir')visit(p.replace(/\/$/,'')+'/'+item.name,indent+(i===children.length-1?'    ':'│   '),depth+1);
        });
      };visit(root);
    });
    reg('cat','Read a file in the virtual filesystem',ctx=>{
      if(!ctx.args.length)throw new Error('missing file operand');
      for(const arg of ctx.args){const f=ctx.fs.get(ctx.resolve(arg));if(!f)throw new Error(arg+': No such file or directory');if(f.kind!=='file')throw new Error(arg+': Is a directory');ctx.print(f.content);}
    });
    reg('echo','Print text',ctx=>ctx.args.join(' '));
    reg('whoami','Show simulated user',ctx=>ctx.engine.username);
    reg('hostname','Show simulated hostname',ctx=>ctx.engine.hostname);
    reg('uname','Display simulated OS information',ctx=>ctx.args.includes('-a')?'Linux ubuntu 6.6.0-WSL2-demo #1 SMP x86_64 GNU/Linux [SIMULATED]':'Linux');
    reg('date','Show date from the browser clock',ctx=>new Date().toString());
    reg('clear','Clear terminal output',ctx=>ctx.clear());
    reg('history','Print commands typed in this session',ctx=>{ctx.engine.history.forEach((s,i)=>ctx.print(String(i+1).padStart(4)+'  '+s));});
    reg('which','Locate an available virtual command',ctx=>{
      if(!ctx.args.length)return 1;
      for(const name of ctx.args){if(!ctx.engine.commands.has(name))continue;ctx.print(name==='wslx'?'/home/dor/.local/bin/wslx':'/usr/bin/'+name);}
    });
    reg('command','Look up a virtual command',ctx=>{
      if(ctx.args[0]!=='-v'||!ctx.args[1])throw new Error('demo supports: command -v <name>');
      const found=ctx.engine.commands.has(ctx.args[1]);if(found)ctx.print(ctx.args[1]==='wslx'?'/home/dor/.local/bin/wslx':'/usr/bin/'+ctx.args[1]);return found?0:1;
    });
    reg('touch','Create a virtual empty file',ctx=>{
      if(!ctx.args.length)throw new Error('missing file operand');
      for(const name of ctx.args){const p=ctx.resolve(name);const parent=p.slice(0,p.lastIndexOf('/'))||'/';if(ctx.fs.get(parent)?.kind!=='dir')throw new Error(name+': parent directory does not exist');if(ctx.fs.get(p)?.kind==='dir')throw new Error(name+': Is a directory');ctx.fs.addFile(p,ctx.fs.get(p)?.content||'');}
    });
    reg('mkdir','Create virtual folders',ctx=>{
      const recursive=ctx.args.includes('-p');const names=ctx.args.filter(x=>x!=='-p');
      if(!names.length)throw new Error('missing directory operand');
      for(const name of names){const p=ctx.resolve(name), parent=p.slice(0,p.lastIndexOf('/'))||'/';if(ctx.fs.get(p))throw new Error('cannot create '+name+': File exists');if(!recursive&&!ctx.fs.get(parent))throw new Error(name+': parent does not exist');ctx.fs.addDir(p);}
    });
    reg('rm','Remove virtual files only (never touches your device)',ctx=>{
      const names=ctx.args.filter(x=>!x.startsWith('-'));if(!names.length)throw new Error('missing file operand');
      for(const name of names){const p=ctx.resolve(name);if(p==='/'||p===ctx.engine.home||p==='/home'||p==='/mnt')throw new Error('protected demo path');
        const entry=ctx.fs.get(p);if(!entry){ctx.print('rm: cannot remove '+name+': No such file or directory','error');continue;}
        if(entry.kind==='dir'&&!ctx.args.includes('-r')&&!ctx.args.includes('-rf')){ctx.print('rm: cannot remove '+name+': Is a directory','error');continue;}
        ctx.fs.remove(p);
      }
    });
    reg('git','Explore simulated Git status (read-only)',ctx=>{
      const sub=ctx.args[0];
      if(sub==='--version')return 'git version 2.43.0 (demo fixture)';
      if(sub==='status'){ctx.print('On branch main','success');ctx.print('nothing to commit, working tree clean','muted');ctx.print('(simulated; not connected to GitHub)','warning');return;}
      if(sub==='remote'&&ctx.args[1]==='-v'){ctx.print('origin  https://github.com/DorManDel/wslx.git (fetch)');ctx.print('origin  https://github.com/DorManDel/wslx.git (push)');ctx.print('(demo fixture; no network call)','warning');return;}
      if(sub==='branch'){ctx.print('* main','success');ctx.print('(simulated)','muted');return;}
      ctx.print('Git demo supports: git status | git remote -v | git branch | git --version','warning');return 2;
    });
    reg('neofetch','Print a small simulated Ubuntu banner',ctx=>{
      ctx.print('    .--.        dor@ubuntu','accent');
      ctx.print('   /    \\       OS: Ubuntu 24.04 LTS · DEMO');
      ctx.print('  |  ()  |      Host: Browser-only sandbox');
      ctx.print('   \\____/       Shell: Bash-like command emulator');
      ctx.print('                Addon: WSLX 0.1.0-dev (simulated)');
    });
    return engine;
  };
})(window);