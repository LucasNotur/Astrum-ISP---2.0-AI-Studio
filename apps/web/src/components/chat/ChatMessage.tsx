import React from 'react';
import type { ChatMessage as ChatMessageType } from '../../hooks/useChat';

interface Props {
  message: ChatMessageType;
}

export function ChatMessage({ message }: Props) {
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`chat-message ${isAssistant ? 'assistant' : 'user'}`}>
      <div className="message-avatar">
        {isAssistant ? '✦' : '👤'}
      </div>

      <div className="message-body">
        <div className="message-content">
          {message.content}
          {message.isStreaming && (
            <span className="typing-cursor" aria-label="digitando" />
          )}
        </div>

        {isAssistant && !message.isStreaming && (
          <div className="message-meta">
            {message.ragUsed && (
              <span className="badge badge-rag" title="Resposta baseada na base de conhecimento">
                📚 RAG
              </span>
            )}
            {message.model && (
              <span className="badge badge-model">{message.model}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
