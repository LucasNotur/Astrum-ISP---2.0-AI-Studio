import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { db } from "@/src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function WebchatPage() {
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get('tenantId');
  const [messages, setMessages] = useState<any[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [tenantName, setTenantName] = useState("Atendimento Online");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => {
     let id = localStorage.getItem('webchat_session_id');
     if (!id) {
         id = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
         localStorage.setItem('webchat_session_id', id);
     }
     return id;
  });
  
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     if (!tenantId) return;
     const loadConfig = async () => {
         try {
             const res = await fetch(`/api/webchat/config?tenantId=${tenantId}`);
             if (res.ok) {
                 const data = await res.json();
                 if (data.agentName) setTenantName(data.agentName);
                 if (data.logoUrl) setLogoUrl(data.logoUrl);
                 if (data.primaryColor) setPrimaryColor(data.primaryColor);
                 
                 if (data.welcomeMessage && messages.length === 0) {
                     setMessages([{ text: data.welcomeMessage, sender: "bot", id: "welcome" }]);
                 }
             }
         } catch(e) {
             console.error("Error loading webchat config", e);
         }
     };
     loadConfig();
  }, [tenantId]);
  
  useEffect(() => {
     endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!tenantId) {
      return <div className="p-4 text-center">Webchat não configurado (Falta tenantId)</div>;
  }

  const handleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputVal.trim() || isLoading) return;
      
      const msg = inputVal.trim();
      setMessages(prev => [...prev, { text: msg, sender: "user", id: Date.now().toString() + Math.random() }]);
      setInputVal("");
      setIsLoading(true);
      
      try {
          const res = await fetch("/api/webchat/message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  tenantId,
                  sessionId,
                  text: msg,
                  pushName: "Visitante"
              })
          });
          const data = await res.json();
          if (data.success && data.text) {
              setMessages(prev => [...prev, { text: data.text, sender: "bot", id: Date.now().toString() + Math.random() }]);
          }
      } catch(e) {
          console.error("Error sending message", e);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 w-full overflow-hidden" style={{ '--theme-color': primaryColor } as any}>
       <div className="p-3 shadow-md flex items-center gap-3 z-10 shrink-0" style={{ backgroundColor: primaryColor, color: 'white' }}>
          {logoUrl ? (
             <img src={logoUrl} alt={tenantName} className="w-8 h-8 rounded-full object-cover bg-white" />
          ) : (
             <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                 <Bot size={18} />
             </div>
          )}
          <span className="font-semibold text-sm">{tenantName}</span>
       </div>
       
       <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
             <div className="text-center text-slate-500 text-sm mt-10">
                Inicie a conversa enviando uma mensagem.
             </div>
          )}
          {messages.map((m, i) => (
             <div key={m.id || i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-2 max-w-[85%] ${m.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                   <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${m.sender === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-slate-200 text-slate-600'}`}>
                      {m.sender === 'user' ? <User size={12} /> : <Bot size={12} />}
                   </div>
                   <div 
                      className={`px-3 text-sm py-2 rounded-2xl ${m.sender === 'user' ? 'rounded-br-sm' : 'bg-white border rounded-bl-sm shadow-sm'}`} 
                      style={{ 
                          wordBreak: 'break-word', 
                          whiteSpace: 'pre-wrap',
                          ...(m.sender === 'user' ? { backgroundColor: primaryColor, color: 'white' } : {}) 
                      }}
                   >
                      {m.text}
                   </div>
                </div>
             </div>
          ))}
          <div ref={endRef} />
       </div>
       
       <div className="p-3 bg-white border-t shrink-0">
          <form onSubmit={handleSend} className="flex gap-2">
             <Input 
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="flex-1 rounded-full text-base bg-slate-50 focus-visible:ring-1" 
                disabled={isLoading}
             />
             <Button 
                type="submit" 
                size="icon" 
                className="rounded-full shrink-0 border-0" 
                disabled={isLoading || !inputVal.trim()}
                style={{ backgroundColor: primaryColor, color: 'white' }}
             >
                <Send size={16} />
             </Button>
          </form>
       </div>
    </div>
  );
}
