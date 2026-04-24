/**
 * Brain Router — thin dispatcher that routes to the correct AI brain
 * based on Space config.
 *
 * Demo cut: basic mode only (direct LLM call).
 * Post-demo: add Hermes adapter, Mem0 injection, OpenClaw, Archon.
 *
 * Per VISION.md: "Xentient is the bridge. Intelligence comes from integration."
 * This module IS that bridge's dispatch layer.
 */

import type { LLMProvider, MemoryContext } from "../providers/types";

export type BrainMode = "basic" | "hermes" | "hermes+mem0" | "openclaw" | "archon";

export interface BrainResponse {
  text: string;
  source: BrainMode;
}

export class BrainRouter {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  /**
   * Route a user message to the correct brain based on mode.
   * Demo: only "basic" is implemented — direct LLM call.
   * Post-demo: each mode routes to its adapter.
   */
  async complete(
    userMessage: string,
    mode: BrainMode = "basic",
    memoryContext?: MemoryContext,
  ): Promise<BrainResponse> {
    switch (mode) {
      case "basic":
        return this.basicComplete(userMessage, memoryContext);
      case "hermes":
        throw new Error("Hermes adapter not yet implemented (post-demo)");
      case "hermes+mem0":
        throw new Error("Hermes+Mem0 adapter not yet implemented (post-demo)");
      case "openclaw":
        throw new Error("OpenClaw adapter not yet implemented (post-demo)");
      case "archon":
        throw new Error("Archon adapter not yet implemented (post-demo)");
      default:
        throw new Error(`Unknown brain mode: ${mode}`);
    }
  }

  private async basicComplete(
    userMessage: string,
    memoryContext?: MemoryContext,
  ): Promise<BrainResponse> {
    const messages = [];
    if (memoryContext?.userProfile) {
      messages.push({ role: "system" as const, content: memoryContext.userProfile });
    }
    if (memoryContext?.relevantEpisodes) {
      messages.push({ role: "system" as const, content: `Relevant context:\n${memoryContext.relevantEpisodes}` });
    }
    if (memoryContext?.extractedFacts) {
      messages.push({ role: "system" as const, content: `Facts:\n${memoryContext.extractedFacts}` });
    }
    messages.push({ role: "user" as const, content: userMessage });

    const tokenStream = this.llm.complete(messages, memoryContext ?? { userProfile: "", relevantEpisodes: "", extractedFacts: "" });

    let text = "";
    for await (const token of tokenStream) {
      text += token;
    }

    return { text, source: "basic" };
  }
}