// 0.3s of 440Hz sine wave at 16kHz, 16-bit LE mono
// Generated at build time — no runtime dependency
export const CHIME_PCM: Buffer = generateSineWave(440, 0.3, 16000);

function generateSineWave(hz: number, durationS: number, sampleRate: number): Buffer {
  const samples = Math.floor(sampleRate * durationS);
  const buf = Buffer.allocUnsafe(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.sin(2 * Math.PI * hz * i / sampleRate);
    buf.writeInt16LE(Math.round(v * 16000), i * 2); // soft amplitude
  }
  return buf;
}
