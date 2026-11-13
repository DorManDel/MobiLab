/** FaceFX: photo and camera detection helpers, no network or server. */
export function detectPortrait(engine, source) {
  const first = engine.detect(source).faceLandmarks?.[0];
  if (first?.length >= 468) return {landmarks: first, strategy: 'original'};
  // Add breathing room to tightly cropped portraits; return coordinates in the
  // original image space because PhotoSwap texture sampling expects that space.
  for (const padding of [0.18, 0.34]) {
    const w = source.width, h = source.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * (1 + 2 * padding));
    canvas.height = Math.round(h * (1 + 2 * padding));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#b9b6b7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ox = (canvas.width - w)/2, oy = (canvas.height - h)/2;
    ctx.drawImage(source, ox, oy);
    const points = engine.detect(canvas).faceLandmarks?.[0];
    if (points?.length >= 468) {
      return {landmarks: points.map(p => ({...p,
        x: (p.x * canvas.width - ox)/w,
        y: (p.y * canvas.height - oy)/h
      })), strategy: 'padded-' + Math.round(padding * 100)};
    }
  }
  return {landmarks: null, strategy: 'not-found'};
}

export class TrackingHealth {
  constructor(){this.reset();}
  reset(){this.attempts = 0;this.misses = 0;this.found = 0;this.lastSeen=0;this.active='VIDEO';this.swapFrames=0;}
  accept(landmarks, time=performance.now()) {
    this.attempts++;
    if(landmarks?.length >= 468){this.found++;this.misses=0;this.lastSeen=time;return true;}
    this.misses++;
    return false;
  }
  shouldTryImageFallback(){return this.misses>=15&&this.attempts>0&&this.misses%15===0;}
  progress(sourceReady){
    if(!this.attempts)return 'WAITING FOR CAMERA';
    if(!this.found)return 'NO FACE DETECTED';
    return sourceReady ? 'TRACKING / READY TO SWAP':'FACE TRACKED / CHOOSE PHOTO';
  }
}
