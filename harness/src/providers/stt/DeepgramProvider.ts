import { createClient, DeepgramClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { Readable } from 'stream';
import { STTProvider, TranscriptChunk } from '../types';
import pino from 'pino';

const logger = pino({ name: 'stt-deepgram' });

export class DeepgramProvider implements STTProvider {
  private client: DeepgramClient;

  constructor(apiKey: string) {
    this.client = createClient(apiKey);
  }

  /** Batch transcription for short utterances (<30s) */
  async transcribe(audioBuffer: Buffer): Promise<string> {
    const { result, error } = await this.client.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        punctuate: true,
      }
    );
    if (error) throw new Error(`Deepgram error: ${error.message}`);
    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    logger.debug({ transcript }, 'Deepgram transcription complete');
    return transcript;
  }

  /**
   * Streaming transcription for VAD-delimited audio.
   * Uses a queue + resolve-notify pattern to bridge Deepgram's event emitter
   * to an async iterable — yields chunks as they arrive, not all at the end.
   */
  async *transcribeStream(audioStream: Readable): AsyncIterable<TranscriptChunk> {
    const queue: TranscriptChunk[] = [];
    let notify: (() => void) | null = null;
    let connectionClosed = false;

    const connection = this.client.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: true,
      endpointing: 300,
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data.channel?.alternatives?.[0];
      // Only yield final transcripts to avoid duplicate partial results
      if (alt?.transcript && data.is_final) {
        queue.push({
          text: alt.transcript,
          is_final: true,
          confidence: alt.confidence,
        });
        notify?.();
      }
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      connectionClosed = true;
      notify?.();
    });

    // Feed audio into Deepgram while queue drains concurrently
    const feedAudio = async () => {
      for await (const chunk of audioStream) {
        // Deepgram SDK requires SocketDataLike (ArrayBuffer | Blob) — extract underlying ArrayBuffer
        const buf = chunk as Buffer;
        connection.send(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      }
      connection.requestClose();
    };

    feedAudio().catch(err => {
      logger.error({ err }, 'Deepgram audio feed error');
      connectionClosed = true;
      notify?.();
    });

    // Yield chunks as they arrive from the event queue
    while (!connectionClosed || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        // Park until Deepgram emits the next final transcript or close event
        await new Promise<void>(resolve => { notify = resolve; });
        notify = null;
      }
    }
  }
}
