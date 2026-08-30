"use client";

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: 'Hello! I am the Skylark Drones BI Agent. How can I help you analyze the sales pipeline or work orders today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isMock, setIsMock] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/mode')
      .then(res => res.json())
      .then(data => setIsMock(data.isMock))
      .catch(console.error);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent, suggestion?: string) => {
    if (e) e.preventDefault();
    
    const messageText = suggestion || input;
    if (!messageText.trim()) return;

    const newMessages = [...messages, { role: 'user', content: messageText }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch (error: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Network Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "How's our pipeline looking for mining sector?",
    "What's the total deal value for won deals?",
    "Show me work orders that are stuck",
    "Give me a leadership update",
    "What's our billing vs collection status?"
  ];

  return (
    <div className="chat-container">
      {isMock !== null && (
        <div style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: isMock ? '#854d0e' : '#166534', color: 'white', fontSize: '0.875rem', fontWeight: 'bold' }}>
          {isMock ? '⚠️ Running on Sample Data (Mock Mode)' : '✅ Connected to live monday.com'}
        </div>
      )}
      <header className="header">
        <h1>Skylark BI Agent</h1>
      </header>
      
      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="markdown">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="markdown">Typing...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <div className="suggestions">
          {suggestions.map((s, i) => (
            <button key={i} className="suggestion-chip" onClick={() => handleSubmit(undefined, s)}>
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about deals, work orders, or pipeline..."
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
