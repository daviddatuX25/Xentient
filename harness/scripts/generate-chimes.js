#!/usr/bin/env node
/**
 * generate-chimes.js
 *
 * Generates chime WAV files for the Xentient heartbeat rule engine.
 * All files: 16kHz mono S16LE PCM wrapped in WAV header.
 *
 * Usage:
 *   node generate-chimes.js [output-dir]
 *
 *   output-dir  — directory to write WAV files into
 *                 (default: ../assets/chimes/ relative to this script)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTE_RATE = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8); // 32000
const BLOCK_ALIGN = NUM_CHANNELS * (BITS_PER_SAMPLE / 8); // 2

/**
 * Build a WAV file Buffer from raw PCM sample data.
 * @param {Int16Array} samples — mono 16-bit signed PCM samples
 * @returns {Buffer}
 */
function buildWav(samples) {
  const dataSize = samples.length * 2; // 2 bytes per sample
  const fileSize = 36 + dataSize;     // RIFF chunk size

  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(fileSize, 4);
  buf.write('WAVE', 8);

  // fmt sub-chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);              // chunk size
  buf.writeUInt16LE(1, 20);               // PCM format
  buf.writeUInt16LE(NUM_CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(BYTE_RATE, 28);
  buf.writeUInt16LE(BLOCK_ALIGN, 32);
  buf.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data sub-chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], offset);
    offset += 2;
  }

  return buf;
}

// ---------------------------------------------------------------------------
// Tone generators
// ---------------------------------------------------------------------------

/**
 * Generate a sine wave tone.
 * @param {number} freq      — frequency in Hz
 * @param {number} durationMs — duration in milliseconds
 * @param {number} amplitude — peak amplitude 0..1 (default 0.8)
 * @returns {Int16Array}
 */
function sineTone(freq, durationMs, amplitude = 0.8) {
  const numSamples = Math.round(SAMPLE_RATE * durationMs / 1000);
  const samples = new Int16Array(numSamples);
  const maxVal = 32767;
  const twoPiF = 2 * Math.PI * freq;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Apply fade-in (5ms) and fade-out (10ms) to avoid clicks
    let env = 1.0;
    const fadeIn = Math.round(SAMPLE_RATE * 0.005);
    const fadeOut = Math.round(SAMPLE_RATE * 0.01);
    if (i < fadeIn) env = i / fadeIn;
    else if (i > numSamples - fadeOut) env = (numSamples - i) / fadeOut;
    samples[i] = Math.round(amplitude * maxVal * env * Math.sin(twoPiF * t));
  }

  return samples;
}

/**
 * Generate silence.
 * @param {number} durationMs — duration in milliseconds
 * @returns {Int16Array}
 */
function silence(durationMs) {
  const numSamples = Math.round(SAMPLE_RATE * durationMs / 1000);
  return new Int16Array(numSamples);
}

/**
 * Concatenate multiple Int16Arrays into one.
 * @param {...Int16Array} arrays
 * @returns {Int16Array}
 */
function concat(...arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Int16Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Chime definitions
// ---------------------------------------------------------------------------

const CHIMES = [
  {
    name: 'morning.wav',
    desc: 'C-E-G chord sequence (200ms each note), pleasant morning greeting',
    generate: () => {
      // C4=261.63, E4=329.63, G4=392.00 (A4=440Hz reference)
      const C4 = 261.63;
      const E4 = 329.63;
      const G4 = 392.00;
      return concat(
        sineTone(C4, 200, 0.7),
        sineTone(E4, 200, 0.7),
        sineTone(G4, 200, 0.7),
      );
    },
  },
  {
    name: 'alert.wav',
    desc: '600Hz, 2x short beep (100ms each, 100ms gap), attention-getting',
    generate: () => concat(
      sineTone(600, 100, 0.9),
      silence(100),
      sineTone(600, 100, 0.9),
    ),
  },
  {
    name: 'chime.wav',
    desc: '523Hz single chime tone (300ms), simple notification',
    generate: () => sineTone(523.25, 300, 0.8),
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const outDir = process.argv[2] || path.resolve(__dirname, '..', 'assets', 'chimes');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating chime WAV files -> ${outDir}\n`);

  for (const chime of CHIMES) {
    const samples = chime.generate();
    const wav = buildWav(samples);
    const filePath = path.join(outDir, chime.name);
    fs.writeFileSync(filePath, wav);

    const durationMs = (samples.length / SAMPLE_RATE) * 1000;
    console.log(`  ${chime.name}  — ${chime.desc}`);
    console.log(`    ${durationMs.toFixed(0)} ms, ${samples.length} samples, ${wav.length} bytes`);
  }

  console.log('\nDone.');
}

main();