import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';
import { TTSProvider } from '../types';
import pino from 'pino';

const logger = pino({ name: 'tts-elevenlabs' });

export class ElevenLabsProvider implements TTSProvider {
  private client: ElevenLabsClient;
  private voiceId: string;

  constructor(apiKey: string, voiceId: string = '21m00Tcm4TlvDq8ikWAM') {
    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = voiceId;
  }

  async synthesize(text: string): Promise<Readable> {
    logger.debug({ textLength: text.length }, 'Synthesizing speech');
    const audioIterable = await this.client.generate({
      voice: this.voiceId,
      text,
      model_id: 'eleven_flash_v2_5',  // ~75ms inference, optimized for real-time
      output_format: 'pcm_16000',     // Match ESP32 expected format
    });
    return Readable.from(audioIterable as AsyncIterable<Buffer>);
  }

  synthesizeStreaming(textStream: AsyncIterable<string>): Readable {
    // Accumulate sentences, trigger TTS as each sentence completes
    const readable = new Readable({ read() {} });
    (async () => {
      let buffer = '';
      for await (const token of textStream) {
        buffer += token;
        // Trigger TTS when we detect a sentence boundary
        if (/[.!?]\s*$/.test(buffer) && buffer.length > 20) {
          const audioStream = await this.synthesize(buffer.trim());
          for await (const chunk of audioStream) {
            readable.push(chunk);
          }
          buffer = '';
        }
      }
      // Flush remaining buffer
      if (buffer.trim()) {
        const audioStream = await this.synthesize(buffer.trim());
        for await (const chunk of audioStream) readable.push(chunk);
      }
      readable.push(null); // End stream
    })().catch(err => readable.destroy(err));
    return readable;
  }
}
