import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Sparkles, Loader2, Bot } from 'lucide-react';
import type { ChatMessage } from '../types';
import { analyzeIntent } from '../services/geminiService';

interface AIAssistantProps {
  onAction: (action: string, params: any) => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ onAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Hi! I\'m Tiwa, your AI Studio Engineer. Ask me about mixing, recording, or how to use the app!' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Call Gemini Service
    const analysis = await analyzeIntent(userMsg.text);
    
    setIsTyping(false);
    
    const aiMsg: ChatMessage = { 
      id: (Date.now() + 1).toString(), 
      role: 'model', 
      text: analysis.reply || "I've processed that for you." 
    };
    setMessages(prev => [...prev, aiMsg]);

    if (analysis.action !== 'UNKNOWN') {
      onAction(analysis.action, analysis.parameters);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform z-50 flex items-center gap-2 border-2 border-white/20"
      >
        <Bot size={24} className="text-yellow-300" />
        <span className="font-bold">Ask Tiwa</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 md:w-96 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-2 text-white font-semibold">
          <div className="bg-indigo-500 p-1.5 rounded-lg">
             <Bot size={18} className="text-white" />
          </div>
          <div>
             <div className="text-sm font-bold">Ask Tiwa</div>
             <div className="text-[10px] text-gray-300">AI Studio Assistant</div>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-white">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="h-96 overflow-y-auto p-4 space-y-3 bg-black/40 backdrop-blur-sm">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-200 rounded-bl-none border border-gray-700'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
             <div className="bg-gray-800 p-3 rounded-2xl rounded-bl-none text-gray-400 border border-gray-700">
               <Loader2 size={16} className="animate-spin text-indigo-400" />
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-gray-950 border-t border-gray-800 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="How do I record? / Fix this mix..."
          className="flex-1 bg-gray-800 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          autoFocus
        />
        <button onClick={handleSend} className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-500 transition-colors">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};