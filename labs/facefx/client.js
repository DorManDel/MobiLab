import { LocalPhotoSwap } from './swap.js';
import { detectPortrait, TrackingHealth } from './detection.js';
// FaceFX Lab v0.3 — on-device live photo swap and filters, optional encrypted PC WebRTC bridge.
// Local Photo Swap: landmark-driven 2D texture warping. NOT a generative/photorealistic model.
'use strict';
const $ = id => document.getElementById(id);
const state = {
  stream: null, pc: null, channel: null, timer: null, animation: 0,
  cameraEpoch: 0, running: false, localEngine: null, visionPromise: null,
  tracked: null, smooth: null, lastDetect: 0, lastFrameTime: -1,
  lastFaceAt: 0, renderCount: 0, renderStart: 0, localMs: null,
  remoteMode: null, sentPings: new Map(), pingIndex: 0,
  photoSwap: new LocalPhotoSwap(), modelBusy: false, swapDrawAt: 0, sourceLoading: false,
  imageEngine: null, imagePromise: null, visionFileset: null, visionSdk: null, sdkPromise: null,
  health: new TrackingHealth(), imageFallback: false, fallbackLoading: false, retryDetectAt: 0,
  peekOriginal: false, lastDetectionTotal: 0, lastSwapTotal: 0,
  mappingBuffer: null, mappingKey: '', pipelinePhase: ''
};
let visionModule = null;
function say(message) {
  $('log').textContent = new Date().toLocaleTimeString() + ' · ' + message + '\n' + $('log').textContent.slice(0, 2400);
}
function setState(name, text, active = false) {
  const el = $(name);
  el.textContent = text;
  el.classList.toggle('active', active);
}
function setCameraStatus(message) { $('cameraStatus').textContent = message; }
function buttons() {
  $('cameraStart').disabled = !!state.stream;
  $('cameraStop').disabled = !state.stream;
  $('snapshot').disabled = !state.stream;
  $('remoteStart').disabled = !!state.pc;
  $('remoteStop').disabled = !state.pc;
  for (const id of ['camera', 'resolution', 'fps']) $(id).disabled = !!state.stream;
  $('remoteMode').disabled = !!state.pc;
  $('clearSource').disabled = !state.photoSwap.ready || state.sourceLoading;
  for (const el of document.querySelectorAll('[data-preset]')) el.disabled=state.sourceLoading;
  $('sourcePhoto').disabled = state.sourceLoading;
}
function resetMetrics() {
  for (const id of ['localFps', 'localMs', 'faceCount', 'remoteFps', 'remoteMs', 'remoteRtt']) $(id).textContent = '—';
  state.renderCount = 0; state.renderStart = performance.now(); state.localMs = null;
  state.lastDetectionTotal=state.health.attempts;state.lastSwapTotal=state.health.swapFrames;
  $('trackingFps').textContent='—';$('swapFps').textContent='—';
}
function displayMode(next) {
  $('viewerGrid').dataset.view = next;
  document.querySelectorAll('[data-view]').forEach(btn => {
    const active = btn.dataset.view === next;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
  displayMode(btn.dataset.view);
  if(btn.dataset.view !== 'mobile') $('pc-setup').open = true;
}));
$('intensity').addEventListener('input', () => { $('intensityValue').textContent = $('intensity').value + '%'; });
$('stability').addEventListener('input', () => { $('stabilityValue').textContent = $('stability').value + '%'; });
$('trackingRate').addEventListener('input', () => { $('trackingValue').textContent = $('trackingRate').value + ' FPS'; });
$('clearLog').addEventListener('click', () => { $('log').textContent = ''; });
$('resetMetrics').addEventListener('click', resetMetrics);

// MediaPipe's IMAGE and VIDEO modes use independent CPU-first instances.
// This avoids resetting one GPU task between source photos and live camera frames.
const MEDIAPIPE_VERSION='0.10.35';
const MODEL_URL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const VISION_URLS=[
  {name:'jsDelivr',module:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+MEDIAPIPE_VERSION+'/vision_bundle.mjs',wasm:'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+MEDIAPIPE_VERSION+'/wasm'},
  {name:'unpkg',module:'https://unpkg.com/@mediapipe/tasks-vision@'+MEDIAPIPE_VERSION+'/vision_bundle.mjs',wasm:'https://unpkg.com/@mediapipe/tasks-vision@'+MEDIAPIPE_VERSION+'/wasm'}
];
function modelStatus(message){$('modelStatus').textContent=message;}
async function loadVisionRuntime(){
  if(state.visionSdk && state.visionFileset)return {sdk:state.visionSdk,fs:state.visionFileset};
  if(state.sdkPromise)return state.sdkPromise;
  state.sdkPromise=(async()=>{
    let lastError;
    for(const source of VISION_URLS){
      try{
        modelStatus('Downloading face engine · '+source.name);
        const sdk=await import(/* @vite-ignore */ source.module);
        if(!sdk?.FaceLandmarker||!sdk?.FilesetResolver)throw new Error('MediaPipe exports missing');
        const fs=await sdk.FilesetResolver.forVisionTasks(source.wasm);
        state.visionSdk=sdk;state.visionFileset=fs;
        say('MediaPipe runtime loaded · '+source.name);
        return {sdk,fs};
      }catch(e){lastError=e;say('Runtime '+source.name+': '+e.message);}
    }
    throw new Error('Face model runtime unavailable. Check browser connection/CDN: '+(lastError?.message||'unknown'));
  })();
  try{return await state.sdkPromise;}catch(e){state.sdkPromise=null;throw e;}
}
async function makeLandmarker(mode){
  const {sdk,fs}=await loadVisionRuntime();
  const opts={
    baseOptions:{modelAssetPath:MODEL_URL,delegate:'CPU'},
    runningMode:mode,
    numFaces:1,outputFaceBlendshapes:false,
    minFaceDetectionConfidence:0.30,
    minFacePresenceConfidence:0.30,
    minTrackingConfidence:0.45
  };
  try{return {engine:await sdk.FaceLandmarker.createFromOptions(fs,opts),delegate:'CPU'};}
  catch(cpuError){
    say(mode+' CPU unavailable, trying GPU: '+cpuError.message);
    opts.baseOptions.delegate='GPU';
    return {engine:await sdk.FaceLandmarker.createFromOptions(fs,opts),delegate:'GPU'};
  }
}
async function initLandmarker(){
  if(state.localEngine)return state.localEngine;
  if(state.visionPromise)return state.visionPromise;
  state.visionPromise=(async()=>{
    modelStatus('Initializing face tracking…');
    const {engine,delegate}=await makeLandmarker('VIDEO');
    state.localEngine=engine;
    modelStatus('Face tracking '+delegate+' · VIDEO mode');
    $('localNote').textContent='Tracking uses '+delegate+' on the phone. Source photos use a separate IMAGE-mode detector.';
    say('Face tracker ready · '+delegate+' VIDEO');
    return engine;
  })();
  try{return await state.visionPromise;}catch(error){state.visionPromise=null;modelStatus('Tracker failed: '+error.message);throw error;}
}
async function initPhotoLandmarker(){
  if(state.imageEngine)return state.imageEngine;
  if(state.imagePromise)return state.imagePromise;
  state.imagePromise=(async()=>{
    const {engine,delegate}=await makeLandmarker('IMAGE');
    state.imageEngine=engine;
    modelStatus('Source detector ready · '+delegate+' IMAGE'+(state.localEngine?' / live VIDEO ready':''));
    say('Source portrait detector ready · '+delegate+' IMAGE');
    return engine;
  })();
  try{return await state.imagePromise;}catch(e){state.imagePromise=null;throw e;}
}
// The health row is a stable status, NOT a success banner and never a log stream.
// Avoid re-announcing or changing layout on each rendered video frame.
function pipelineStatus(message,ok=false){
  const el=$('pipelineStatus'); if(!el)return;
  const phase=String(message);
  if(phase===state.pipelinePhase)return;
  state.pipelinePhase=phase;
  el.textContent=phase;
  // Drawing triangles proves a renderer ran, not that identity replacement worked.
  const rendered=phase==='2D OVERLAY DRAWN';
  el.classList.toggle('is-ok',Boolean(ok) && !rendered);
  el.classList.toggle('is-rendered',rendered);
}
function mapEdges(ctx,points,edges,w,h,color,lineWidth){
  if(!edges?.length)return;
  ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();
  for(const edge of edges){
    const a=points[edge.start],b=points[edge.end];
    if(!a||!b)continue;
    ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);
  }
  ctx.stroke();
}
function drawFaceMap(ctx,points,mode,w,h,intensity){
  const fl=state.visionSdk?.FaceLandmarker;
  if(!fl || !points?.length)return;
  ctx.save();ctx.globalAlpha=Math.max(.18,intensity);
  if(mode==='mesh'){
    mapEdges(ctx,points,fl.FACE_LANDMARKS_TESSELATION,w,h,'rgba(115,242,223,.64)',Math.max(.5,w/1000));
    mapEdges(ctx,points,fl.FACE_LANDMARKS_FACE_OVAL,w,h,'#fff1a4',Math.max(1,w/440));
  }else if(mode==='contours'){
    mapEdges(ctx,points,fl.FACE_LANDMARKS_CONTOURS,w,h,'#7ce9ef',Math.max(1.4,w/370));
    mapEdges(ctx,points,fl.FACE_LANDMARKS_LIPS,w,h,'#ffc88a',Math.max(1,w/410));
    mapEdges(ctx,points,fl.FACE_LANDMARKS_FACE_OVAL,w,h,'#fff4ae',Math.max(1.8,w/320));
  }else{
    ctx.fillStyle='#9af5e0';
    const radius=Math.max(1.2,w/600);
    for(const p of points){ctx.beginPath();ctx.arc(p.x*w,p.y*h,radius,0,Math.PI*2);ctx.fill();}
  }
  // Important anchors shown in every mapping mode.
  for(const index of [1,4,33,263,61,291,152]){
    const p=points[index];if(!p)continue;
    ctx.fillStyle='#ffe68c';ctx.beginPath();ctx.arc(p.x*w,p.y*h,Math.max(2.2,w/290),0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
function easePoints(raw) {
  if (!raw) return null;
  if (!state.smooth || state.smooth.length !== raw.length) state.smooth = raw.map(p => ({x:p.x,y:p.y,z:p.z}));
  else for (let i = 0; i < raw.length; i++) {
    const k = Math.max(.12, 1-Number($('stability').value)/100);
    state.smooth[i].x += (raw[i].x - state.smooth[i].x) * k;
    state.smooth[i].y += (raw[i].y - state.smooth[i].y) * k;
    state.smooth[i].z += (raw[i].z - state.smooth[i].z) * k;
  }
  return state.smooth;
}
function faceOverlay(ctx, points, effect, intensity, w, h, alpha) {
  if (!points || effect === 'none' || alpha <= 0) return;
  const p = n => ({x: points[n].x * w, y: points[n].y * h});
  const left = p(33), right = p(263), nose = p(1), chin = p(152), top = p(10);
  const dx = right.x - left.x, dy = right.y - left.y;
  const width = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
  ctx.save();ctx.globalAlpha = alpha * intensity;
  if (effect === 'mesh') {
    ctx.fillStyle = '#f8d47d';
    for (let i = 0; i < points.length; i += 4) { const pt = p(i);ctx.beginPath();ctx.arc(pt.x,pt.y,Math.max(1,w/650),0,Math.PI*2);ctx.fill(); }
    ctx.strokeStyle='#bda7ff';ctx.lineWidth=Math.max(1,w/500);
    ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.lineTo(nose.x,nose.y);ctx.lineTo(chin.x,chin.y);ctx.stroke();
  } else if (effect === 'visor') {
    const midX=(left.x+right.x)/2,midY=(left.y+right.y)/2;
    ctx.translate(midX,midY);ctx.rotate(angle);
    ctx.beginPath();ctx.moveTo(-width*.69,-width*.20);ctx.lineTo(width*.69,-width*.20);ctx.lineTo(width*.56,width*.23);ctx.quadraticCurveTo(0,width*.48,-width*.56,width*.23);ctx.closePath();
    const grd=ctx.createLinearGradient(0,-width*.2,0,width*.5);grd.addColorStop(0,'rgba(177,104,255,.68)');grd.addColorStop(1,'rgba(21,218,228,.2)');
    ctx.fillStyle=grd;ctx.fill();ctx.strokeStyle='#e6cbff';ctx.lineWidth=Math.max(2,width*.022);ctx.stroke();
    // The camera preview is mirrored: avoid mirrored text on the visor.
    ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=Math.max(1,width*.014);
    ctx.beginPath();ctx.moveTo(-width*.42,-width*.1);ctx.lineTo(-width*.18,-width*.1);ctx.stroke();
  } else if (effect === 'mask') {
    const cheekL=p(205), cheekR=p(425), bridge=p(4);
    const jaw=[454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234];
    ctx.beginPath();const anchor=p(234);ctx.moveTo(anchor.x,anchor.y);
    ctx.quadraticCurveTo(cheekL.x,cheekL.y,bridge.x,bridge.y);
    ctx.quadraticCurveTo(cheekR.x,cheekR.y,p(454).x,p(454).y);
    for(const id of jaw.slice(1)){const q=p(id);ctx.lineTo(q.x,q.y);}
    ctx.closePath();
    ctx.fillStyle='rgba(57,18,109,.50)';ctx.fill();ctx.strokeStyle='#9cf9db';ctx.lineWidth=Math.max(2,w/260);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cheekL.x,cheekL.y);ctx.lineTo(p(58).x,p(58).y);
    ctx.moveTo(cheekR.x,cheekR.y);ctx.lineTo(p(288).x,p(288).y);
    ctx.strokeStyle='rgba(156,249,219,.55)';ctx.stroke();
    ctx.fillStyle='#ffe48f';ctx.beginPath();ctx.arc(bridge.x,bridge.y,Math.max(3,w/125),0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
function localLoop(now) {
  if (!state.stream) return;
  const video=$('sourceVideo');
  const canvas=$('localCanvas');
  if (video.readyState >= 2 && video.videoWidth > 0) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    }
    const ctx=canvas.getContext('2d',{alpha:false});
    const mirror=$('camera').value==='user';
    ctx.save();if (mirror) {ctx.translate(canvas.width,0);ctx.scale(-1,1);}
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const effect=$('effect').value;
    if (state.localEngine && !state.modelBusy && effect!=='none' && now - state.lastDetect >= 1000/Number($('trackingRate').value) && video.currentTime !== state.lastFrameTime) {
      const begin=performance.now();
      try {
        const mode=state.imageFallback && state.imageEngine?'IMAGE fallback':'VIDEO';
        const result=mode==='IMAGE fallback'?state.imageEngine.detect(video):state.localEngine.detectForVideo(video,now);
        let found=result.faceLandmarks?.[0]||null;
        const ok=state.health.accept(found,now);
        if(!ok && state.health.shouldTryImageFallback()){
          if(state.imageEngine && !state.imageFallback){
            const backup=state.imageEngine.detect(video).faceLandmarks?.[0]||null;
            if(backup?.length>=468){found=backup;state.imageFallback=true;state.health.misses=0;state.health.found++;state.health.lastSeen=now;say('Video mode missed the face; image-mode fallback found one.');}
          } else if(!state.imageEngine && !state.fallbackLoading){
            state.fallbackLoading=true;
            initPhotoLandmarker().catch(e=>say('Static fallback unavailable: '+e.message)).finally(()=>{state.fallbackLoading=false;});
          }
        }
        state.localMs=performance.now()-begin;
        $('localMs').textContent=state.localMs.toFixed(1);
        state.tracked=found;
        $('faceCount').textContent=found?'1':'0';
        if(found)state.lastFaceAt=now;
        const stage=!found?'NO FACE DETECTED'
          : effect==='swap'?(state.photoSwap.ready?(state.health.swapFrames?'2D OVERLAY DRAWN':'PHOTO READY · FACE TRACKED'):'FACE TRACKED · CHOOSE PHOTO')
          : ['mesh','points','contours'].includes(effect)?'FACE MAPPING ACTIVE':'FACE TRACKED · AR FILTER';
        pipelineStatus(stage,!!found);
      } catch(error) {say('Face detection error: '+error.message);pipelineStatus('DETECTION ERROR · '+error.message);state.localEngine=null;state.visionPromise=null;}
      state.lastDetect=now;state.lastFrameTime=video.currentTime;
    }
    if (effect!=='none' && state.tracked && !state.peekOriginal) {
      const alpha=Math.max(0,1-Math.max(0,now-state.lastFaceAt-180)/260);
      const pts=easePoints(state.tracked);
      const qualityMode=$('swapQuality').value;
      const quality=qualityMode==='fast'?.55:qualityMode==='detail'?1:canvas.width>700?.65:.80;
      const swapHz=qualityMode==='fast'?9:qualityMode==='detail'?12:11;
      if(effect === 'swap' && state.photoSwap.ready && now - state.swapDrawAt > 1000/swapHz) {
        const beginSwap=performance.now();
        state.photoSwap.render(pts,canvas.width,canvas.height,quality,Number($('expression').value)/100);
        state.health.swapFrames++;
        pipelineStatus('2D OVERLAY DRAWN',true);
        state.swapDrawAt=now;
        $('localMs').textContent=(state.localMs+performance.now()-beginSwap).toFixed(1);
      }
      if(effect==='swap' && state.photoSwap.ready){
        ctx.globalAlpha=alpha*Number($('intensity').value)/100*state.photoSwap.visibility;
        ctx.drawImage(state.photoSwap.buffer,0,0,canvas.width,canvas.height);
        ctx.globalAlpha=1;
      }else if(['mesh','points','contours'].includes(effect)){
        const opacity=Number($('intensity').value)/100*alpha;
        const key=[state.health.attempts,effect,canvas.width,canvas.height,Math.round(opacity*100)].join(':');
        if(!state.mappingBuffer)state.mappingBuffer=document.createElement('canvas');
        if(state.mappingBuffer.width!==canvas.width||state.mappingBuffer.height!==canvas.height){
          state.mappingBuffer.width=canvas.width;state.mappingBuffer.height=canvas.height;state.mappingKey='';
        }
        if(state.mappingKey!==key){
          const mc=state.mappingBuffer.getContext('2d');
          mc.clearRect(0,0,canvas.width,canvas.height);
          drawFaceMap(mc,pts,effect,canvas.width,canvas.height,opacity);
          state.mappingKey=key;
        }
        ctx.drawImage(state.mappingBuffer,0,0);
      }else if(effect!=='swap'){
        faceOverlay(ctx,pts,effect,Number($('intensity').value)/100,canvas.width,canvas.height,alpha);
      }
    }
    ctx.restore();
    state.renderCount++;
    if (now-state.renderStart>=1000) {
      const dt=(now-state.renderStart)/1000;
      $('localFps').textContent=String(Math.round(state.renderCount/dt));
      $('trackingFps').textContent=(Math.max(0,state.health.attempts-state.lastDetectionTotal)/dt).toFixed(1);
      $('swapFps').textContent=(Math.max(0,state.health.swapFrames-state.lastSwapTotal)/dt).toFixed(1);
      state.lastDetectionTotal=state.health.attempts;state.lastSwapTotal=state.health.swapFrames;
      state.renderCount=0;state.renderStart=now;
    }
  }
  state.animation=requestAnimationFrame(localLoop);
}
async function startCamera() {
  if (state.stream) return;
  const epoch=++state.cameraEpoch;
  if (!navigator.mediaDevices?.getUserMedia) {setCameraStatus('Camera requires HTTPS / localhost');return;}
  setCameraStatus('Requesting camera permission…');
  try {
    const width=Number($('resolution').value),height=width===640?480:Math.round(width*9/16);
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:$('camera').value},width:{ideal:width},height:{ideal:height},frameRate:{ideal:Number($('fps').value)}}});
    if (epoch!==state.cameraEpoch) {stream.getTracks().forEach(t=>t.stop());return;}
    state.stream=stream;
    $('sourceVideo').srcObject=stream;
    await $('sourceVideo').play();
    state.tracked=null;state.smooth=null;state.lastFrameTime=-1;state.lastDetect=0;state.lastFaceAt=0;state.swapDrawAt=0;
    state.peekOriginal=false; $('peekOriginal').classList.remove('pressed');
    resetMetrics();state.health.reset();state.imageFallback=false;
    pipelineStatus('CAMERA ON · FINDING FACE');
    $('localPlaceholder').hidden=true;
    $('remoteVideo').classList.toggle('mirror',$('camera').value==='user');
    setState('localState','LIVE',true);
    setCameraStatus('Camera active · 100% local · PC not required');
    state.animation=requestAnimationFrame(localLoop);
    buttons();say('Camera opened locally.');
    if ($('effect').value!=='none') {
      initLandmarker().catch(error=>{say('Face model failed: '+error.message);$('localNote').textContent=error.message+' Camera preview is still available.';});
    }
  } catch(error){setCameraStatus('Camera error: '+error.message);say('Camera error: '+error.message);buttons();}
}
async function stopCamera() {
  ++state.cameraEpoch;
  await stopRemote();
  cancelAnimationFrame(state.animation);state.animation=0;
  if (state.stream)state.stream.getTracks().forEach(t=>t.stop());
  state.stream=null;state.tracked=null;state.smooth=null;state.imageFallback=false;
  pipelineStatus('CAMERA OFF');
  $('sourceVideo').pause();$('sourceVideo').srcObject=null;
  $('localPlaceholder').hidden=false;
  $('localCanvas').getContext('2d')?.clearRect(0,0,$('localCanvas').width,$('localCanvas').height);
  setState('localState','IDLE');setCameraStatus('Camera off · no frames uploaded');buttons();
}
$('cameraStart').addEventListener('click',startCamera);
$('cameraStop').addEventListener('click',stopCamera);
const peekButton=$('peekOriginal');
function setPeek(active){state.peekOriginal=!!active;peekButton.classList.toggle('pressed',!!active);peekButton.setAttribute('aria-pressed',String(!!active));}
peekButton.addEventListener('pointerdown',e=>{e.preventDefault();setPeek(true);});
for(const type of ['pointerup','pointercancel','lostpointercapture','pointerleave'])peekButton.addEventListener(type,()=>setPeek(false));
peekButton.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setPeek(true);}});
peekButton.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setPeek(false);}});
$('expression').addEventListener('input',()=>{$('expressionValue').textContent=$('expression').value+'%';});
$('effect').addEventListener('change',()=>{
  state.swapDrawAt=0;
  state.mappingKey='';
  pipelineStatus(['mesh','points','contours'].includes($('effect').value)?'MAPPING · FINDING FACE':$('effect').value==='swap'?'SWAP MODE · SELECT PHOTO':'FILTER MODE');
  $('sourcePicker').hidden = $('effect').value!=='swap';
  if(state.stream && $('effect').value!=='none')initLandmarker().catch(e=>say('Model: '+e.message));
});
const PRESETS = {
  'studio-curly': {name:'Curly',path:'./presets/studio-curly.webp'},
  'studio-ginger': {name:'Ginger',path:'./presets/studio-ginger.webp'},
  'studio-bangs': {name:'Bangs',path:'./presets/studio-bangs.webp'}
};
function selectedPreset(id){
  document.querySelectorAll('[data-preset]').forEach(button=>{
    const active=button.dataset.preset===id;
    button.classList.toggle('is-selected',active);
    button.setAttribute('aria-pressed',String(active));
  });
}
async function loadPhoto(file,presetId=''){
  if(!file || state.sourceLoading)return;
  state.sourceLoading=true;buttons();
  $('sourceStatus').textContent='Preparing face source locally · no uploads…';
  try {
    const engine=await initPhotoLandmarker();
    let photoStrategy='original';
    const result=await state.photoSwap.loadFile(file,async image=>{
      state.modelBusy=true;
      try {
        const found=detectPortrait(engine,image);
        photoStrategy=found.strategy;
        return found.landmarks;
      }finally {state.modelBusy=false;}
    });
    state.swapDrawAt=0;state.health.swapFrames=0;state.lastSwapTotal=0;selectedPreset(presetId);
    $('sourcePreview').src=state.photoSwap.photo.toDataURL('image/webp',.78);
    $('sourcePreview').hidden=false;
    $('sourceStatus').textContent='SOURCE VERIFIED · '+file.name+' · '+result.triangles+' triangles ('+photoStrategy+'). '+(state.stream?'Center your whole face in the camera.':'Tap Start camera.');
    pipelineStatus('PHOTO READY · WAITING FOR FACE');
    say('Source ready · '+file.name+' · '+result.triangles+' triangles');
  }catch(error){
    $('sourceStatus').textContent='SOURCE NOT DETECTED · '+(error?.message||String(error))+' · Please try another portrait with eyes, nose and chin visible.';
    say('Source face error: '+(error?.message||String(error)));
  }finally{state.sourceLoading=false;$('sourcePhoto').value='';buttons();}
}
$('sourcePhoto').addEventListener('change',event=>{void loadPhoto(event.target.files?.[0]);});
for(const button of document.querySelectorAll('[data-preset]')){
  button.addEventListener('click',async()=>{
    if(state.sourceLoading)return;
    const preset=PRESETS[button.dataset.preset];
    if(!preset)return;
    try{
      $('sourceStatus').textContent='Opening '+preset.name+' preset…';
      const response=await fetch(preset.path,{cache:'force-cache'});
      if(!response.ok)throw new Error('Preset file unavailable ('+response.status+').');
      const blob=await response.blob();
      await loadPhoto(new File([blob],preset.name+'.webp',{type:'image/webp'}),button.dataset.preset);
    }catch(error){
      $('sourceStatus').textContent='Preset could not load: '+error.message;
      say('Preset error: '+error.message);
    }
  });
}
$('retryModel').addEventListener('click',async()=>{
  modelStatus('Restarting detector · CPU first…');
  try{
    state.localEngine?.close?.();state.imageEngine?.close?.();
    state.localEngine=null;state.imageEngine=null;state.visionPromise=null;state.imagePromise=null;
    state.tracked=null;state.health.reset();state.imageFallback=false;
    await initLandmarker();await initPhotoLandmarker();
    $('sourceStatus').textContent='Detectors restarted. Select a preset to test source-face detection.';
    pipelineStatus('DETECTORS RESTARTED · test a preset');
  }catch(e){$('sourceStatus').textContent=e.message;modelStatus('Restart failed · '+e.message);}
});
$('clearSource').addEventListener('click',()=>{
  if(state.sourceLoading)return;
  state.photoSwap.clear();state.swapDrawAt=0;selectedPreset('');
  $('sourcePhoto').value='';$('sourcePreview').removeAttribute('src');$('sourcePreview').hidden=true;
  $('sourceStatus').textContent='Source cleared. Select a preset or upload your own portrait.';
  buttons();say('Local source removed from memory.');
});

// PC bridge: GitHub Pages serves only the UI. Windows/Tailscale serves /health, /offer and /close.
function serverBase() {
  const raw=$('serverUrl').value.trim().replace(/\/+$/,'');
  if(!raw)throw new Error('Enter the private PC HTTPS URL first.');
  const u=new URL(raw);
  const local=['localhost','127.0.0.1'].includes(u.hostname);
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))throw new Error('Use an HTTPS URL (or localhost for desktop testing).');
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Enter only the origin, without a path or credentials.');
  return u.origin;
}
function token(){const t=$('pairToken').value.trim();if(!t)throw new Error('Enter the session token printed by the PC server.');return t;}
function serverHeaders(){return {'X-FaceFX-Token':token()};}
async function api(path,options={}) {
  const response=await fetch(serverBase()+path,{
    ...options,headers:{...serverHeaders(),...(options.headers||{})},cache:'no-store',signal:options.signal||AbortSignal.timeout(16000)
  });
  if(!response.ok)throw new Error((await response.text()).slice(0,250)||`HTTP ${response.status}`);
  return response.json();
}
async function checkServer() {
  $('healthStatus').textContent='Contacting PC…';
  try{
    const x=await api('/health');
    $('healthStatus').textContent=`Connected: ${x.service}. AI model configured: ${x.swap_configured?'yes':'no'}. Bridge private; no recording.`;
    say('PC health OK · model: '+(x.swap_configured?'ready':'not configured'));
  }catch(error){$('healthStatus').textContent='Connection failed: '+error.message+'. Check Tailscale Serve, address, token and CORS.';say('PC check: '+error.message);}
}
$('checkServer').addEventListener('click',checkServer);
$('serverUrl').addEventListener('change',()=>{try{const b=serverBase();localStorage.setItem('mobilab.facefx.bridge.origin',b);}catch{}});
if(['localhost','127.0.0.1'].includes(location.hostname)||location.hostname.endsWith('.ts.net')) $('serverUrl').value=location.origin;
else $('serverUrl').value=localStorage.getItem('mobilab.facefx.bridge.origin')||'';
function waitIce(connection) {
  if(connection.iceGatheringState==='complete')return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const id=setTimeout(()=>{clean();reject(new Error('WebRTC ICE gathering timeout'));},15000);
    function clean(){clearTimeout(id);connection.removeEventListener('icegatheringstatechange',changed);}
    function changed(){if(connection.iceGatheringState==='complete'){clean();resolve();}}
    connection.addEventListener('icegatheringstatechange',changed);
  });
}
async function updateRemoteStats() {
  if(!state.pc)return;
  for(const report of (await state.pc.getStats()).values()){
    if(report.type==='inbound-rtp' && (report.kind==='video'||report.mediaType==='video') && Number.isFinite(report.framesPerSecond)){
      $('remoteFps').textContent=String(Math.round(report.framesPerSecond));
    }
  }
  if(state.channel?.readyState==='open'){
    const nonce=String(++state.pingIndex);
    state.sentPings.set(nonce,performance.now());
    state.channel.send(JSON.stringify({type:'ping',nonce}));
    if(state.sentPings.size>5)state.sentPings.delete(state.sentPings.keys().next().value);
  }
}
async function startRemote() {
  if(state.pc)return;
  try {
    if(!state.stream)await startCamera();
    if(!state.stream)throw new Error('Start phone camera first.');
    const base=serverBase(), secret=token();
    const health=await api('/health');
    if($('remoteMode').value==='swap'&&!health.swap_configured)throw new Error('AI Face Swap is not configured on PC. Read the PC setup guide.');
    state.pc=new RTCPeerConnection({iceServers:[]});
    const pc=state.pc;
    pc.ontrack=e=>{
      $('remoteVideo').srcObject=new MediaStream([e.track]);
      $('remoteVideo').play().catch(err=>say('Remote video playback: '+err.message));
      $('remotePlaceholder').hidden=true;
      setState('remoteState','LIVE',true);
    };
    pc.onconnectionstatechange=()=>{
      if(state.pc!==pc)return;
      say('WebRTC: '+pc.connectionState);
      if(pc.connectionState==='connected')setState('remoteState','LIVE',true);
      if(['failed','closed'].includes(pc.connectionState))stopRemote();
    };
    pc.addTrack(state.stream.getVideoTracks()[0],state.stream);
    state.channel=pc.createDataChannel('facefx-metrics');
    state.channel.onmessage=event=>{
      try {
        const o=JSON.parse(event.data);if(o.type!=='pong')return;
        const sent=state.sentPings.get(o.nonce);
        if(sent!=null){$('remoteRtt').textContent=String(Math.round(performance.now()-sent));state.sentPings.delete(o.nonce);}
        if(o.processing_ms!=null)$('remoteMs').textContent=String(o.processing_ms);
      }catch{ /* Ignore unexpected telemetry */ }
    };
    $('remoteStart').disabled=true;setState('remoteState','PAIRING');
    await pc.setLocalDescription(await pc.createOffer());await waitIce(pc);
    const answer=await api('/offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:pc.localDescription.sdp,type:pc.localDescription.type,mode:$('remoteMode').value})});
    await pc.setRemoteDescription(answer);
    state.timer=setInterval(()=>updateRemoteStats().catch(e=>say('WebRTC stats: '+e.message)),1200);
    say('RTC offer complete · '+$('remoteMode').value+' · '+base);
    buttons();
  }catch(error){say('RTX bridge error: '+error.message);$('remoteNote').textContent='Bridge error: '+error.message;await stopRemote(false);}
}
async function stopRemote(notify=true) {
  if(state.timer)clearInterval(state.timer);state.timer=null;
  const pc=state.pc;state.pc=null;state.channel=null;state.sentPings.clear();
  if(pc)pc.close();
  $('remoteVideo').pause();$('remoteVideo').srcObject=null;
  $('remotePlaceholder').hidden=false;setState('remoteState','OFFLINE');buttons();
  if(notify&&pc)api('/close',{method:'POST'}).catch(e=>say('Close notify: '+e.message));
}
$('remoteStart').addEventListener('click',startRemote);
$('remoteStop').addEventListener('click',()=>stopRemote());

$('snapshot').addEventListener('click',()=>{
  if(!state.stream)return;
  const out=document.createElement('canvas');const width=600,height=450;
  out.width=width*2;out.height=height+66;
  const ctx=out.getContext('2d');ctx.fillStyle='#0d0a18';ctx.fillRect(0,0,out.width,out.height);
  const a=$('localCanvas');ctx.drawImage(a,0,0,width,height);
  if($('remoteVideo').readyState>=2){
    ctx.save();if($('camera').value==='user'){ctx.translate(width*2,0);ctx.scale(-1,1);ctx.drawImage($('remoteVideo'),0,0,width,height);}else ctx.drawImage($('remoteVideo'),width,0,width,height);ctx.restore();
  }else{ctx.fillStyle='#231d34';ctx.fillRect(width,0,width,height);ctx.fillStyle='#bba2dc';ctx.font='22px sans-serif';ctx.fillText('PC not connected',width+40,height/2);}
  ctx.fillStyle='#120f1be9';ctx.fillRect(0,height,out.width,66);ctx.fillStyle='#f9e6aa';ctx.font='bold 17px sans-serif';ctx.fillText('MOBILE / '+$('effect').selectedOptions[0].text,15,height+25);
  ctx.fillStyle='#c2aeff';ctx.fillText('RTX / '+$('remoteMode').selectedOptions[0].text,width+15,height+25);
  ctx.fillStyle='#d7cee7';ctx.font='12px sans-serif';ctx.fillText('Local: '+$('localFps').textContent+' FPS / '+$('localMs').textContent+' ms',15,height+48);
  ctx.fillText('Remote: '+$('remoteFps').textContent+' FPS / '+$('remoteMs').textContent+' ms',width+15,height+48);
  const link=document.createElement('a');link.download='FaceFX-comparison-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';link.href=out.toDataURL('image/png');link.click();
  say('Comparison snapshot saved locally by user action.');
});

// Closing the page or hiding it stops camera and remote processing.
window.addEventListener('pagehide',()=>{void stopCamera();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.stream)void stopCamera();});
buttons();resetMetrics();displayMode('mobile');modelStatus('Not loaded yet · select a portrait or start the camera');say('FaceFX v0.7 · stable status row and real MediaPipe face mapping modes.');
