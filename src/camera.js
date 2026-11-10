// MobiLab — camera and relative orientation helpers. No data leaves the device.
export class CameraLab {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facingMode = "user";
    this.initialAlpha = null;
    this.motionHandler = null;
  }
  async start(facingMode = this.facingMode) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable. Open the site via HTTPS.");
    this.stop();
    this.facingMode = facingMode;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }
  stop() {
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
  capture() {
    if (!this.stream || !this.video.videoWidth) throw new Error("Start camera before capturing.");
    const canvas = document.createElement("canvas");
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext("2d").drawImage(this.video, 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.9);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mobilab-camera-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
    link.click();
  }
  async watchOrientation(onReading) {
    if (!("DeviceOrientationEvent" in window)) throw new Error("Orientation sensor unavailable");
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const status = await DeviceOrientationEvent.requestPermission();
      if (status !== "granted") throw new Error("Sensor permission was not granted");
    }
    this.stopOrientation();
    this.initialAlpha = null;
    this.motionHandler = (event) => {
      if (typeof event.alpha !== "number") return;
      if (this.initialAlpha === null) this.initialAlpha = event.alpha;
      const delta = ((event.alpha - this.initialAlpha + 540) % 360) - 180;
      onReading({ alpha: event.alpha, relative: delta, beta: event.beta, gamma: event.gamma });
    };
    window.addEventListener("deviceorientation", this.motionHandler);
  }
  stopOrientation() {
    if (this.motionHandler) window.removeEventListener("deviceorientation", this.motionHandler);
    this.motionHandler = null;
    this.initialAlpha = null;
  }
}
