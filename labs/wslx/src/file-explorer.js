/*
 * MobiLab · WSLX Explorer R0.3
 * Reusable visual adapter over the same VirtualFS as the terminal.
 * Device import is opt-in, limited and copy-only: no host writes, no real absolute paths.
 */
(function(global){
  'use strict';
  const lab=global.WSLXLab, engine=lab.engine;
  if(!engine)return;
  const $=id=>document.getElementById(id);
  const root=$('fileExplorer');if(!root)return;
  const fs=engine.fs;
  const base=name=>name.slice(name.lastIndexOf('/')+1);
  const parent=path=>path==='/'?'/':path.slice(0,path.lastIndexOf('/'))||'/';
  const join=(a,b)=>a==='/'?'/'+b:a+'/'+b;
  const protectedPaths=new Set(['/','/home','/home/dor','/mnt','/mnt/c','/mnt/d','/etc','/usr','/usr/local','/usr/local/bin','/tmp']);
  const resolve=s=>engine.path(s);
  const pathLabel=path=>path.length>90?'…'+path.slice(-87):path;
  const notice=(message,isError=false)=>{const n=$('fxNotice');n.textContent=message;n.style.color=isError?'var(--red)':'var(--muted)';};
  const safeName=name=>{
    if(!name||name==='.'||name==='..'||name.includes('/')||name.includes('\\')||name.includes('\0'))throw new Error('Enter a single filename/folder name (no slashes).');
    if(name.length>180)throw new Error('Name must be under 180 characters.');
    return name;
  };
  let folder=engine.cwd,selected=null,undo=null,dirty=false;
  const inFolder=path=>path===folder||path.startsWith(folder+'/');
  const selectedEntry=()=>selected?fs.get(selected):null;
  function button(text,fn,extra=''){
    const el=document.createElement('button');el.type='button';el.textContent=text;if(extra)el.className=extra;
    el.addEventListener('click',fn);return el;
  }
  function checkDirty(){return !dirty||confirm('Discard unsaved edits in the virtual file editor?');}
  function checkpoint(){undo={entries:fs.snapshot(),cwd:engine.cwd,oldpwd:engine.env.OLDPWD,folder,selected};$('fxUndo').disabled=false;}
  function rollback(){if(!undo)return;fs.restore(undo.entries);engine.cwd=undo.cwd;engine.env.PWD=undo.cwd;engine.env.OLDPWD=undo.oldpwd;folder=undo.folder;selected=undo.selected;undo=null;dirty=false;engine.notify();lab.refreshTerminal();notice('Undid the last Explorer change.');}
  function renderCrumbs(){
    const container=$('fxCrumbs');container.replaceChildren();
    container.append(button('root',()=>navigate('/')));
    let path='';for(const segment of folder.split('/').filter(Boolean)){
      const sep=document.createElement('span');sep.className='fx-crumb-sep';sep.textContent='/';container.append(sep);
      path+='/'+segment;const dest=path;container.append(button(segment,()=>navigate(dest)));
    }
  }
  function renderEditor(){
    const entry=selectedEntry();
    if(!entry)selected=null;
    const file=entry?.kind==='file';
    $('fxSelection').textContent=selected?pathLabel(selected):'Select a file or folder to inspect.';
    $('fxFileType').textContent=entry?(file?'TEXT FILE':'FOLDER'):'NO SELECTION';
    $('fxTarget').disabled=!entry;$('fxMove').disabled=!entry||protectedPaths.has(selected);
    $('fxDelete').disabled=!entry||protectedPaths.has(selected);
    $('fxContent').disabled=!file;$('fxSave').disabled=!file;
    $('fxTarget').value=selected||'';
    $('fxContent').value=file?entry.content:'';
    dirty=false;$('fxDirtyNote').textContent=file?'Saved in virtual RAM':'No file selected';$('fxDirtyNote').classList.remove('is-dirty');
  }
  function renderList(){
    const list=$('fxFiles');list.replaceChildren();
    const entry=fs.get(folder);
    if(entry?.kind!=='dir'){
      const msg=document.createElement('div');msg.className='fx-empty';msg.textContent='Folder no longer exists. Use Home.';list.append(msg);return;
    }
    const children=fs.children(folder);
    $('fxCount').textContent=children.length+' item'+(children.length===1?'':'s');
    if(folder!=='/')list.append(button('↑   ..',()=>navigate(parent(folder))));
    for(const item of children){
      const itemPath=join(folder,item.name);
      const wrapper=document.createElement('div');wrapper.className='fx-file-row';wrapper.setAttribute('role','listitem');
      const row=button('',()=>{
        if(item.kind==='dir')navigate(itemPath);
        else {if(!checkDirty())return;selected=itemPath;renderList();renderEditor();}
      });
      row.setAttribute('aria-current',String(selected===itemPath));
      const ico=document.createElement('span');ico.className='fx-icon';ico.textContent=item.kind==='dir'?'▣':'▤';
      const label=document.createElement('span');label.className='fx-item-label';label.textContent=item.name+(item.kind==='dir'?'/':'');
      const extra=document.createElement('span');extra.className='fx-item-extra';extra.textContent=item.kind==='file'?(item.content.length+' B'):'›';
      row.append(ico,label,extra);wrapper.append(row);
      if(item.kind==='dir'){
        const inspect=button('⋯',()=>{if(!checkDirty())return;selected=itemPath;renderList();renderEditor();},'fx-inspect');
        inspect.title='Select folder for rename, move or delete';inspect.setAttribute('aria-label','Inspect folder '+item.name);wrapper.append(inspect);
      }
      list.append(wrapper);
    }
    if(!children.length){const empty=document.createElement('div');empty.className='fx-empty';empty.textContent='(empty directory)';list.append(empty);}
  }
  function refresh({followShell=false}={}){
    if(followShell){if(!checkDirty())return;folder=engine.cwd;}
    if(fs.get(folder)?.kind!=='dir')folder=fs.get(engine.cwd)?.kind==='dir'?engine.cwd:engine.home;
    if(selected&&!fs.get(selected))selected=null;
    $('fxPath').value=folder;renderCrumbs();renderList();renderEditor();
  }
  function navigate(destination){
    if(!checkDirty())return;
    try{
      const resolved=resolve(destination),item=fs.get(resolved);
      if(!item)throw new Error('Path does not exist: '+resolved);
      if(item.kind==='file'){
        folder=parent(resolved);selected=resolved;
      }else{folder=resolved;selected=null;}
      // The visual explorer follows the actual simulated shell cwd.
      if(folder!==engine.cwd){engine.env.OLDPWD=engine.cwd;engine.cwd=folder;engine.env.PWD=folder;}
      dirty=false;refresh();lab.refreshTerminal();notice('Virtual directory: '+folder);
    }catch(error){notice(error.message,true);}
  }
  $('fxGoForm').addEventListener('submit',event=>{event.preventDefault();navigate($('fxPath').value.trim()||'.');});
  $('fxHome').addEventListener('click',()=>navigate(engine.home));
  $('fxUp').addEventListener('click',()=>navigate(parent(folder)));
  $('fxContent').addEventListener('input',()=>{if(!selectedEntry()||selectedEntry().kind!=='file')return;dirty=true;$('fxDirtyNote').textContent='Unsaved virtual edits';$('fxDirtyNote').classList.add('is-dirty');});
  function create(kind){
    if(!checkDirty())return;
    try{
      const name=safeName($('fxNewName').value.trim()),dest=join(folder,name);
      if(fs.get(dest))throw new Error('Already exists: '+dest);
      checkpoint();
      if(kind==='dir')fs.mkdir(dest);else fs.writeFile(dest,'',{create:true});
      $('fxNewName').value='';selected=kind==='file'?dest:null;engine.notify();refresh();notice('Created virtual '+kind+': '+dest);
    }catch(error){notice(error.message,true);}
  }
  $('fxNewFile').addEventListener('click',()=>create('file'));
  $('fxNewFolder').addEventListener('click',()=>create('dir'));
  $('fxSave').addEventListener('click',()=>{
    if(!selected||selectedEntry()?.kind!=='file')return;
    try{
      const text=$('fxContent').value;
      if(text.length>250000)throw new Error('Virtual text files limited to 250 KB.');
      checkpoint();fs.writeFile(selected,text);dirty=false;engine.notify();refresh();notice('Saved virtual file: '+selected);
    }catch(error){notice(error.message,true);}
  });
  $('fxMove').addEventListener('click',()=>{
    if(!selected||!checkDirty())return;
    try{
      if(protectedPaths.has(selected))throw new Error('This demo directory is protected.');
      const source=selected,dest=resolve($('fxTarget').value.trim());
      checkpoint();fs.move(source,dest);
      const rebase=value=>value===source||value.startsWith(source+'/')?dest+value.slice(source.length):value;
      engine.cwd=rebase(engine.cwd);engine.env.PWD=engine.cwd;
      if(engine.env.OLDPWD)engine.env.OLDPWD=rebase(engine.env.OLDPWD);
      folder=fs.get(rebase(folder))?.kind==='dir'?rebase(folder):parent(dest);
      selected=dest;dirty=false;engine.notify();lab.refreshTerminal();refresh();notice('Moved virtual path to '+dest);
    }catch(error){notice(error.message,true);}
  });
  $('fxDelete').addEventListener('click',()=>{
    if(!selected||!checkDirty())return;
    if(protectedPaths.has(selected)||inFolder(engine.cwd)&&selected===engine.cwd||engine.cwd.startsWith(selected+'/')){notice('Cannot delete protected path or current working directory.',true);return;}
    if(!confirm('Delete this virtual '+selectedEntry()?.kind+' and its contents?\n'+selected+'\n\nYour real device files are not affected.'))return;
    checkpoint();fs.remove(selected);const removed=selected;selected=null;dirty=false;engine.notify();refresh();notice('Deleted virtual entry: '+removed);
  });
  $('fxUndo').addEventListener('click',rollback);

  const TEXT_EXT=/\.(txt|md|json|csv|tsv|html?|css|js|mjs|cjs|jsx|ts|tsx|py|c|cpp|h|hpp|java|cs|sh|bash|zsh|yml|yaml|xml|ini|cfg|conf|log|toml|gitignore|sql|svg|bat|ps1)$/i;
  const goodFile=file=>file.type.startsWith('text/')||/(json|xml|javascript)/i.test(file.type)||TEXT_EXT.test(file.name)||!file.name.includes('.');
  function importPath(file,asFolder){
    const source=asFolder?(file.webkitRelativePath||file.name):file.name;
    const parts=source.replace(/\\/g,'/').split('/');
    if(parts.some(part=>part==='.'||part==='..'||!part||part.includes('\0')))throw new Error('Invalid imported relative path: '+source);
    for(const part of parts)safeName(part);
    return join(folder,parts.join('/'));
  }
  async function importSelected(files,asFolder){
    if(!checkDirty())return;
    const all=[...files];if(!all.length)return;
    if(all.length>120){notice('Select up to 120 text files at a time.',true);return;}
    let total=0,added=0,skipped=0;const staged=[];
    try{
      for(const file of all){
        if(file.size>200000||!goodFile(file)){skipped++;continue;}
        total+=file.size;if(total>2000000)throw new Error('Import limit is 2 MB total.');
        const destination=importPath(file,asFolder);
        if(fs.get(destination)){skipped++;continue;}
        const content=await file.text();
        if(content.includes('\0')||content.includes('\ufffd')){skipped++;continue;}
        staged.push({destination,content});
      }
      if(!staged.length){notice('Nothing imported. Only new small text files are supported; binary and existing files were skipped.',true);return;}
      checkpoint();const before=undo;
      try{
        for(const item of staged){
          const dest=item.destination;if(fs.get(dest))continue;
          const dir=parent(dest);if(!fs.get(dir))fs.addDir(dir);
          fs.writeFile(dest,item.content,{create:true});added++;
        }
      }catch(error){fs.restore(before.entries);undo=null;$('fxUndo').disabled=true;throw error;}
      engine.notify();refresh();notice('Imported '+added+' selected text file(s) into '+folder+'. '+skipped+' skipped. Originals remain unchanged.');
    }catch(error){notice(error.message,true);}
  }
  const attach=(pickId,inputId,isFolder)=>{
    const input=$(inputId);
    $(pickId).addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{await importSelected(input.files||[],isFolder);input.value='';});
  };
  attach('fxPickFiles','fxFileInput',false);
  attach('fxPickFolder','fxFolderInput',true);
  // Optional File System Access API: read-only handle to a folder explicitly picked by the user.
  // The browser does NOT expose absolute device paths, and the handle is held in memory only.
  let linked=null;
  async function scanHandle(dir,name,depth=0,files=[]){
    if(depth>7)throw new Error('Folder nesting is too deep for this lab.');
    for await(const entry of dir.values()){
      if(files.length>=120)throw new Error('Linked folder limit: 120 files.');
      const next=name?name+'/'+entry.name:entry.name;
      if(entry.kind==='directory')await scanHandle(entry,next,depth+1,files);
      else if(entry.kind==='file')files.push({handle:entry,path:next});
    }
    return files;
  }
  async function refreshLinked(){
    if(!linked)return;
    const files=await scanHandle(linked.handle,'');let staged=[],total=0,skipped=0;
    for(const item of files){
      const file=await item.handle.getFile();
      if(file.size>200000||!goodFile(file)){skipped++;continue;}
      total+=file.size;if(total>2000000)throw new Error('Read-only mirror limit: 2 MB total.');
      const parts=item.path.split('/');for(const part of parts)safeName(part);
      const content=await file.text();if(content.includes('\0')||content.includes('\ufffd')){skipped++;continue;}
      const destination=linked.root+'/'+item.path;
      if(fs.get(destination)?.kind==='dir')throw new Error('Cannot replace virtual directory: '+destination);
      staged.push({destination,content});
    }
    checkpoint();const previous=undo;
    try{
      if(!fs.get(linked.root))fs.addDir(linked.root);
      for(const item of staged){
        if(!fs.get(parent(item.destination)))fs.addDir(parent(item.destination));
        fs.writeFile(item.destination,item.content,{create:true});
      }
    }catch(error){fs.restore(previous.entries);undo=null;$('fxUndo').disabled=true;throw error;}
    engine.notify();refresh();notice('Read-only mirror refreshed at '+linked.root+': '+staged.length+' text files, '+skipped+' skipped. Changes in the virtual mirror may be overwritten on refresh; the device was not modified.');
  }
  $('fxConnectFolder').addEventListener('click',async()=>{
    if(typeof global.showDirectoryPicker!=='function'||!global.isSecureContext){
      notice('Live folder links are unavailable here. Use Import folder. On supported devices, open MobiLab over HTTPS.',true);return;
    }
    try{
      // Must be invoked directly from the user click for browser activation.
      const handle=await global.showDirectoryPicker({mode:'read'});
      const safe=safeName(handle.name||'Selected');
      let mount=engine.home+'/device/'+safe,number=2;
      while(fs.get(mount))mount=engine.home+'/device/'+safe+'-'+number++;
      linked={handle,root:mount};$('fxRefreshFolder').disabled=false;
      await refreshLinked();navigate(mount);
    }catch(error){if(error.name!=='AbortError')notice('Folder link failed: '+error.message,true);}
  });
  $('fxRefreshFolder').addEventListener('click',async()=>{
    if(!linked)return;
    if(!confirm('Refresh from the selected device folder? This may overwrite edits in the virtual mirror, but never writes to the original folder.'))return;
    try{await refreshLinked();}catch(error){notice('Folder refresh failed: '+error.message,true);}
  });
  $('fxExport').addEventListener('click',()=>{
    const data=JSON.stringify({...fs.exportData(),cwd:engine.cwd,exportedAt:new Date().toISOString()},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='wslx-workspace.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Workspace JSON exported. No files were uploaded to a server.');
  });
  $('fxImportSnapshot').addEventListener('click',()=>$('fxSnapshotInput').click());
  $('fxSnapshotInput').addEventListener('change',async()=>{
    const file=$('fxSnapshotInput').files?.[0];$('fxSnapshotInput').value='';if(!file)return;
    try{
      if(file.size>4*1024*1024)throw new Error('Snapshot must be smaller than 4 MB.');
      const data=JSON.parse(await file.text());
      if(!checkDirty()||!confirm('Replace all virtual files with this workspace snapshot? This does not modify your device files.'))return;
      checkpoint();fs.importData(data);engine.cwd=fs.get(data.cwd)?.kind==='dir'?data.cwd:engine.home;engine.env.PWD=engine.cwd;engine.env.OLDPWD='';folder=engine.cwd;selected=null;
      engine.notify();lab.refreshTerminal();refresh();notice('Workspace snapshot restored. Use Undo to restore the previous virtual workspace.');
    }catch(error){notice('Snapshot import rejected: '+error.message,true);}
  });
  // Stay in sync with commands such as cd, wcd, mkdir and rm.
  engine.subscribe(()=>{
    if(dirty)return; // Do not discard the user's unsaved editor content.
    if(engine.cwd!==folder){folder=engine.cwd;selected=null;}
    refresh();
  });
  refresh();
  lab.explorer={refresh,navigate,importSelected};
})(window);