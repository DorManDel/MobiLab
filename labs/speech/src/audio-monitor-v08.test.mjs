import assert from "node:assert/strict";
import {SpeechAudioMonitor} from "./audio-monitor-v08.js";
const monitor=new SpeechAudioMonitor();
monitor.configure({sensitivity:30,inertia:0,gain:-10,showWave:false,enabled:true});
assert.equal(monitor.sensitivity,4);
assert.equal(monitor.inertia,.22); // zero maps to default
assert.equal(monitor.gain,.25);
assert.equal(monitor.showWave,false);
monitor.configure({enabled:false});
assert.equal(monitor.enabled,false);
assert.equal(monitor.state,"idle");
console.log("AudioMonitor configuration boundaries and idle state passed.");
