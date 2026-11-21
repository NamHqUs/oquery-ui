import type { ChatModelAdapter } from "@assistant-ui/react";

const MOCK_REPLY = "This is a mock reply. The LangGraph backend is not connected yet, so text streams from this placeholder.";
const WORD_DELAY_MS = 60;

// Streams the reply word by word, yielding the full text so far on each step like a real backend would.
export const mockChatAdapter: ChatModelAdapter = {
  async *run({ abortSignal }) {
    let text = "";
    for (const word of MOCK_REPLY.split(" ")) {
      await new Promise((resolve) => setTimeout(resolve, WORD_DELAY_MS));
      if (abortSignal.aborted) return;
      text = text ? `${text} ${word}` : word;
      yield { content: [{ type: "text", text }] };
    }
  },
};
