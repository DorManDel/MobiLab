/*
 * WSLX current commands and planned-addon showcase.
 * Based on the public DorManDel/wslx CLI (main branch, Nov 2026).
 * WSLX path behavior is approximated in JavaScript; real WSLX delegates to wslpath.
 */
(function(global){
  'use strict';
  global.WSLXLab.installWSLX = function(engine){
    const reg=(name,description,handler,aliases=[],status='current')=>engine.register({name,description,handler,aliases,section:'WSLX',status});
    const pathHelp=[
      'Usage: wslx <path> | wslx path <path>',
      '       wslx path [--wsl|--win|--link] <path>',
      '       wslx --wsl <path> | --win <path> | --link <path>',
      'Example: wslx "D:\\Projects\\Demo"'
    ].join('\n');
    const doPath=(ctx,args)=>{
      if(args.includes('--help')||args.includes('-h')){ctx.print(pathHelp);return 0;}
      let mode='wsl',items=[];
      for(const part of args){
        if(part==='--wsl')mode='wsl';
        else if(part==='--win')mode='win';
        else if(part==='--link')mode='link';
        else if(part.startsWith('-')){ctx.print('wslx: path: unknown option: '+part,'error');return 2;}
        else items.push(part);
      }
      if(items.length!==1){ctx.print('wslx: path: exactly one path is required','error');return 2;}
      const input=items[0];
      if(mode==='wsl')ctx.print(ctx.toWSL(input),'success');
      else if(mode==='win')ctx.print(ctx.toWindows(input),'success');
      else{ctx.print(ctx.toWindows(input),'success');ctx.print('(clickable file links are intentionally disabled in the browser demo)','muted');}
      return 0;
    };
    reg('wslx','WSLX path, doctor, version, navigation and help',ctx=>{
      const a=ctx.args;
      if(!a.length || ['help','-h','--help'].includes(a[0])){
        ctx.print('WSLX 0.1.0-dev  ·  Windows ↔ WSL toolkit','title');ctx.print('');
        ctx.print('CURRENT IN REPOSITORY','success');
        ctx.print('  wslx <path>           Convert Windows → WSL');
        ctx.print('  wslx path <path>      Explicit path conversion');
        ctx.print('  wslx --win <path>     Windows path representation');
        ctx.print('  wslx --link <path>    Terminal link (text only in demo)');
        ctx.print('  wslx cd <path>        Change Bash directory via shell integration');
        ctx.print('  wslx doctor           Check environment');
        ctx.print('  wslx version          Print installed version');
        ctx.print('  wslx uninstall        Remove current-user installation (blocked here)');
        ctx.print('');ctx.print('PLANNED ADDON PREVIEWS','warning');
        ctx.print('  wopen, wreveal, wclip, wpaste, wcode, wslx info, wslx drives');
        ctx.print('');ctx.print('All output is simulated. Real source: github.com/DorManDel/wslx','muted');
        return;
      }
      const sub=a[0];
      if(['version','-v','--version'].includes(sub)){ctx.print('0.1.0-dev (simulator models WSLX main)','success');return;}
      if(sub==='doctor'){
        ctx.print('WSLX Doctor  [BROWSER SIMULATION]','title');ctx.print('');
        ctx.print('✓ Virtual Ubuntu session initialized','success');
        ctx.print('✓ JavaScript command registry loaded','success');
        ctx.print('✓ Virtual filesystem mounted','success');
        ctx.print('✓ WSLX path and cd adapters available','success');
        ctx.print('');ctx.print('Real WSL, Bash, Windows interop and dependencies were NOT checked.','warning');
        return;
      }
      if(sub==='path')return doPath(ctx,a.slice(1));
      if(['--wsl','--win','--link'].includes(sub))return doPath(ctx,a);
      if(sub==='cd'){
        const parts=a.slice(1);if(parts[0]==='--')parts.shift();
        if(parts.length!==1){ctx.print('wslx: cd: exactly one directory is required','error');return 2;}
        ctx.changeDirectory(ctx.toWSL(parts[0]));return;
      }
      if(sub==='uninstall'){
        ctx.print('Blocked: there is no WSLX installation to remove in this browser.','warning');return 1;
      }
      if(sub==='open'||sub==='reveal'){return addonOpen(ctx,sub,a.slice(1));}
      if(sub==='clip'){return addonClip(ctx,a.slice(1));}
      if(sub==='paste'){return addonPaste(ctx);}
      if(sub==='code'){return addonCode(ctx,a.slice(1));}
      if(sub==='info'){return addonInfo(ctx);}
      if(sub==='drives'){return addonDrives(ctx);}
      if(sub==='ports'){ctx.print('Planned feature · demo only. No system ports are queried.','warning');return;}
      if(sub==='kill-port'){ctx.print('Not available: process termination is disabled in the preview.','warning');return 1;}
      if(a.length===1 && (a[0].includes('/')||/^[a-z]:[\\/]/i.test(a[0])||a[0]==='.'||a[0]==='..'))return doPath(ctx,a);
      ctx.print('wslx: Unknown command: '+sub,'error');ctx.print('Run wslx help for usage.','muted');return 2;
    },[],'current');
    reg('wcd','WSLX: change directory using Windows or WSL paths',ctx=>{
      const args=ctx.args[0]==='--'?ctx.args.slice(1):ctx.args;
      if(args.length!==1){ctx.print('Usage: wcd [--] <path>','error');return 2;}
      ctx.changeDirectory(ctx.toWSL(args[0]));
    });
    function addonOpen(ctx,action,args){
      const p=args[0]||'.',path=ctx.resolve(ctx.toWSL(p));
      ctx.print('PREVIEW · WSLX '+action+' (planned addon)','warning');
      ctx.print((action==='reveal'?'Reveal in Explorer: ':'Open via Windows association: ')+ctx.toWindows(path),'accent');
      ctx.print('No file, application or Explorer process was launched.','muted');
    }
    function addonClip(ctx,args){
      if(!args.length){ctx.print('Usage: wclip <text>  (virtual clipboard only)','warning');return 2;}
      engine.clipboard=args.join(' ');ctx.print('Copied to virtual clipboard ('+engine.clipboard.length+' chars).','success');ctx.print('Your real OS clipboard was not accessed.','muted');
    }
    function addonPaste(ctx){ctx.print(engine.clipboard||'(virtual clipboard is empty)','muted');}
    function addonCode(ctx,args){
      const path=ctx.resolve(ctx.toWSL(args[0]||'.'));
      ctx.print('PREVIEW · wslx code (planned addon)','warning');ctx.print('Would open in VS Code: '+path,'accent');ctx.print('No local editor was started.','muted');
    }
    function addonInfo(ctx){ctx.print('WSLX info  [PLANNED · BROWSER MOCK]','title');ctx.print('Distro: Ubuntu (simulated)');ctx.print('Shell: Bash-like JavaScript emulator');ctx.print('Mounts: /mnt/c, /mnt/d (virtual)');ctx.print('Interop: unavailable in public browser preview','warning');}
    function addonDrives(ctx){ctx.print('MOUNT        DRIVE       TYPE','title');ctx.print('/mnt/c       C:\\         virtual');ctx.print('/mnt/d       D:\\         virtual');ctx.print('(No physical disks inspected)','muted');}
    reg('wopen','Preview planned Windows open addon',ctx=>addonOpen(ctx,'open',ctx.args),[], 'planned-preview');
    reg('wreveal','Preview planned Explorer reveal addon',ctx=>addonOpen(ctx,'reveal',ctx.args),[], 'planned-preview');
    reg('wclip','Preview planned clipboard write addon',ctx=>addonClip(ctx,ctx.args),[], 'planned-preview');
    reg('wpaste','Read the in-memory preview clipboard',ctx=>addonPaste(ctx),[], 'planned-preview');
    reg('wcode','Preview planned VS Code bridge addon',ctx=>addonCode(ctx,ctx.args),[], 'planned-preview');
    return engine;
  };
})(window);