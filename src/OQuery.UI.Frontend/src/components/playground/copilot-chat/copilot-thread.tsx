import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useLocalRuntime } from "@assistant-ui/react";
import Icon from "../../icon/icon";
import { mockChatAdapter } from "./mock-chat-adapter";

function UserMessage() {
  return <MessagePrimitive.Root className="pg-chat-message pg-chat-message-user"><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

function AssistantMessage() {
  return <MessagePrimitive.Root className="pg-chat-message pg-chat-message-assistant"><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

export default function CopilotThread() {
  const runtime = useLocalRuntime(mockChatAdapter);
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="pg-chat">
      <ThreadPrimitive.Viewport className="pg-chat-viewport">
        <ThreadPrimitive.Messages>
          {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="pg-chat-composer">
        <ComposerPrimitive.Input placeholder="e.g. Show top customers by revenue" rows={4} />
        <ComposerPrimitive.Send className="pg-chat-send" aria-label="Send" title="Send"><Icon name="send" size={14} /></ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
