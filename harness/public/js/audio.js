// audio.js — Live ESP32 mic passthrough
// Int16 PCM at 16kHz → Web Audio API scheduled playback

let audioCtx = null;
let gainNode = null;
let ws = null;
let nextStartTime = 0;
let isStreaming = false;
let pingInterval = null;

export function toggleAudioStream() {
  isStreaming ? stopStream() : startStream();
}

function startStream() {
  const btn = document.getElementById('btn-audio-stream');
  const vol = document.getElementById('audio-volume');

  // MUST happen inside user gesture — browser autoplay policy
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

  // Resume in case browser suspended context (common on reload)
  audioCtx.resume();

  // Gain node for volume control
  gainNode = audioCtx.createGain();
  gainNode.gain.value = vol ? parseFloat(vol.value) : 1.0;
  gainNode.connect(audioCtx.destination);

  // 200ms jitter buffer — prevents buffer underrun clicks on first chunk
  nextStartTime = audioCtx.currentTime + 0.2;

  const wsUrl = `ws://${window.location.hostname}:3000/live-audio`;
  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    isStreaming = true;
    if (btn) btn.textContent = '■ Stop Listening';
    if (btn) btn.classList.add('btn-active');
    
    // Keepalive ping to prevent silent WebSocket closes
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(new Uint8Array([0x00]));
      }
    }, 15000);
  };

  ws.onmessage = (event) => {
    if (!audioCtx || audioCtx.state === 'closed') return;

    // Int16 LE (ESP32) → Float32 (Web Audio)
    const pcm16 = new Int16Array(event.data);
    const buffer = audioCtx.createBuffer(1, pcm16.length, 16000);
    const f32 = buffer.getChannelData(0);
    for (let i = 0; i < pcm16.length; i++) {
      f32[i] = pcm16[i] / 32768.0;
    }

    // Scheduling: prevent drift if we fall behind
    if (nextStartTime < audioCtx.currentTime) {
      nextStartTime = audioCtx.currentTime + 0.05;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(nextStartTime);
    nextStartTime += buffer.duration;
  };

  ws.onerror = () => stopStream();
  ws.onclose = () => {
    if (isStreaming) stopStream(); // unexpected close
  };
}

function stopStream() {
  isStreaming = false;
  if (ws) { ws.close(); ws = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  gainNode = null;
  nextStartTime = 0;

  const btn = document.getElementById('btn-audio-stream');
  if (btn) { btn.textContent = '▶ Listen to Node'; btn.classList.remove('btn-active'); }
}

export function setVolume(val) {
  if (gainNode) gainNode.gain.value = parseFloat(val);
}

// Expose for onclick handlers in overview.js template strings
window.toggleAudioStream = toggleAudioStream;
window.setAudioVolume = setVolume;
