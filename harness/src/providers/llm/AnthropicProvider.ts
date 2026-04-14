import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, Message, MemoryContext } from '../types';
import pino from 'pino';

const logger = pino({ name: 'llm-anthropic' });

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *complete(
    messages: Message[],
    context: MemoryContext,
    options: { temperature?: number; maxTokens?: number } = {}
  ): AsyncIterable<string> {
    const systemPrompt = this.buildSystemPrompt(context);

    const stream = await this.client.messages.stream({
      model: this.model,
      system: systemPrompt,
      messages: messages
        .filter(m => m.role !== 'system')  // Anthropic handles system via separate param
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 500,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }

  private buildSystemPrompt(context: MemoryContext): string {
    return `You are Xentient, a spatial intelligence assistant.

## User Profile
${context.userProfile}

## What I Know About This User
${context.extractedFacts || 'No facts stored yet.'}

## Relevant Past Conversations
${context.relevantEpisodes || 'No relevant history found.'}

Be concise, warm, and helpful. Respond in 1-3 sentences unless depth is requested.`;
  }
}
