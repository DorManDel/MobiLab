/**
 * Read-only VU + speech waveform. No audio ever leaves this analyzer, and
 * it does not connect to an audio output destination.
 *
 * Note: Web Speech API captures audio independently. Some Android browsers
 * cannot share the microphone; if this capture fails, STT still runs.
 */
export class SpeechAudioMonitor {
  constructor({canvas,needle,status,onLevel=()=>{}}={}){
    this.canvas=canvas;
    this.needle=needle;
    this.status=status;
    this.onLevel=onLevel;
    this.context=null;
    this.stream=null;
    this.node=null;
    this.samples=null;
    this.frame=0;
    this.generation=0;
    this.level=0;
    this.peak=0;
    this.sensitivity=1;
    this.inertia=0.22;
    this.gain=1;
    this.showWave=true;
    this.enabled=true;
    this.lastRender=0;
    this.state="idle";
    this.paintSilence();
  }
  configure({enabled=this.enabled,sensitivity=this.sensitivity,
    inertia=this.inertia,gain=this.gain,showWave=this.showWave}={}){
    this.enabled=Boolean(enabled);
    this.sensitivity=Math.max(.3,Math.min(4,Number(sensitivity)||1));
    this.inertia=Math.max(.03,Math.min(.85,Number(inertia)||.22));
    this.gain=Math.max(.25,Math.min(5,Number(gain)||1));
    this.showWave=Boolean(showWave);
    if(this.canvas)this.canvas.hidden=!this.showWave;
    if(!this.enabled)this.stop();
  }
  updateStatus(label){
    this.state=label;
    if(this.status)this.status.textContent=label==="live"?"AUDIO ●":label==="idle"?"AUDIO —":
      label==="blocked"?"NO METER":label==="unsupported"?"NOT SUPPORTED":"CONNECTING";
  }
  paintSilence(){
    const c=this.canvas;if(!c)return;
    const dpr=Math.min(2,typeof devicePixelRatio==="number"?devicePixelRatio:1);
    const cssWidth=Math.max(10,Math.round(c.clientWidth||96));
    const cssHeight=Math.max(8,Math.round(c.clientHeight||15));
    const w=Math.round(cssWidth*dpr),h=Math.round(cssHeight*dpr);
    if(c.width!==w)c.width=w;
    if(c.height!==h)c.height=h;
    const ctx=c.getContext("2d");if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle="#f3da9e75";
    ctx.fillRect(0,h/2,w,Math.max(1,dpr));
  }
  render(time){
    if(!this.node||!this.samples)return;
    if(time-this.lastRender>=33){
      this.lastRender=time;
      this.node.getFloatTimeDomainData(this.samples);
      let sum=0,peak=0;
      for(let i=0;i<this.samples.length;i++){
        const x=this.samples[i];
        sum+=x*x;peak=Math.max(peak,Math.abs(x));
      }
      const rms=Math.sqrt(sum/this.samples.length);
      // Quiet-room noise gate; VU measures level, not transcription confidence.
      const desired=Math.max(0,Math.min(1,(rms-.008)*this.sensitivity*9));
      this.level+=(desired-this.level)*(desired>this.level?.28:this.inertia);
      this.peak=Math.max(peak,this.peak*.85);
      if(this.needle){
        const angle=-48+this.level*93;
        this.needle.style.transform="rotate("+angle.toFixed(2)+"deg)";
      }
      this.onLevel(this.level);
      this.drawWave();
    }
    this.frame=requestAnimationFrame(t=>this.render(t));
  }
  drawWave(){
    const canvas=this.canvas;
    if(!canvas||!this.showWave)return;
    const dpr=Math.min(2,typeof devicePixelRatio==="number"?devicePixelRatio:1);
    const cw=Math.max(10,Math.round(canvas.clientWidth||96));
    const ch=Math.max(8,Math.round(canvas.clientHeight||15));
    const w=Math.round(cw*dpr),h=Math.round(ch*dpr);
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    const y=h/2;
    ctx.strokeStyle="#f2d69a66";ctx.lineWidth=Math.max(1,dpr*.65);
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
    const bins=Math.max(8,Math.min(cw,120));
    const stride=this.samples.length/bins;
    ctx.strokeStyle="#fbdfa1";ctx.lineWidth=Math.max(1,dpr);
    ctx.beginPath();
    for(let i=0;i<bins;i++){
      const start=Math.floor(i*stride),end=Math.min(this.samples.length,Math.floor((i+1)*stride));
      let low=1,high=-1;
      for(let j=start;j<end;j++){
        const sample=this.samples[j];
        if(sample<low)low=sample;
        if(sample>high)high=sample;
      }
      const x=i*w/(bins-1),scale=(h*.41)*this.gain;
      const yLow=y-Math.max(-1,Math.min(1,low))*scale;
      const yHigh=y-Math.max(-1,Math.min(1,high))*scale;
      ctx.moveTo(x,Math.max(0,Math.min(h,yLow)));
      ctx.lineTo(x,Math.max(0,Math.min(h,yHigh)));
    }
    ctx.stroke();
  }
  async start(){
    if(!this.enabled){this.updateStatus("idle");return false;}
    this.stop();
    const current=++this.generation;
    if(!navigator.mediaDevices?.getUserMedia || !(window.AudioContext||window.webkitAudioContext)){
      this.updateStatus("unsupported");return false;
    }
    this.updateStatus("connecting");
    let stream=null,audio=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},
        video:false
      });
      if(current!==this.generation){stream.getTracks().forEach(track=>track.stop());return false;}
      audio=new (window.AudioContext||window.webkitAudioContext)();
      await audio.resume();
      if(current!==this.generation){
        stream.getTracks().forEach(track=>track.stop());await audio.close();return false;
      }
      const input=audio.createMediaStreamSource(stream);
      const node=audio.createAnalyser();
      node.fftSize=1024;
      node.smoothingTimeConstant=.16;
      input.connect(node);
      this.context=audio;this.stream=stream;this.node=node;
      this.samples=new Float32Array(node.fftSize);
      this.level=0;this.updateStatus("live");
      this.frame=requestAnimationFrame(t=>this.render(t));
      return true;
    }catch(error){
      stream?.getTracks().forEach(track=>track.stop());
      if(audio)await audio.close().catch(()=>{});
      if(current===this.generation)this.updateStatus("blocked");
      return false;
    }
  }
  stop(){
    this.generation++;
    if(typeof cancelAnimationFrame==="function")cancelAnimationFrame(this.frame);
    this.frame=0;
    this.stream?.getTracks().forEach(track=>track.stop());
    this.stream=null;this.node?.disconnect();this.node=null;
    this.samples=null;
    const context=this.context;this.context=null;
    if(context)void context.close().catch(()=>{});
    this.level=0;this.peak=0;
    if(this.needle)this.needle.style.transform="rotate(-48deg)";
    this.paintSilence();
    this.updateStatus("idle");
  }
}
