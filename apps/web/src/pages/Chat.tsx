import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { ChatMessage } from '../components/chat/ChatMessage';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, stopStreaming, isStreaming, error } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const msg = input;
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="chat-title">
          <span className="chat-icon">✦</span>
          <div>
            <h2>AstroChat</h2>
            <p className="chat-subtitle">Assistente IA para seu ISP</p>
          </div>
        </div>
        {isStreaming && (
          <button className="btn-stop" onClick={stopStreaming} aria-label="Parar geração">
            ⏹ Parar
          </button>
        )}
      </header>

      <div className="chat-messages" role="log" aria-live="polite" aria-label="Histórico de mensagens">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>👋 Olá! Como posso ajudar com seu provedor hoje?</p>
            <div className="chat-suggestions">
              {['Como reiniciar o roteador?', 'Verificar status do serviço', 'Ver faturas em aberto'].map(s => (
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="chat-error" role="alert">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <textarea
          id="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem... (Enter para enviar)"
          disabled={isStreaming}
          rows={1}
          className="chat-textarea"
          aria-label="Campo de mensagem"
        />
        <button
          type="submit"
          className="btn-send"
          disabled={isStreaming || !input.trim()}
          aria-label={isStreaming ? 'Aguarde...' : 'Enviar mensagem'}
        >
          {isStreaming ? '⏳' : '➤'}
        </button>
      </form>
    </div>
  );
}
