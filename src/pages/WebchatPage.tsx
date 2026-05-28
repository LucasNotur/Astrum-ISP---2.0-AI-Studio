import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Bot, User, Phone, MapPin, ExternalLink, Zap } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { db } from "@/src/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

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

  // Quick actions array
  const quickActions = [
     "Quero ver os Planos",
     "2ª Via do Boleto",
     "Suporte Técnico",
     "Falar com Atendente"
  ];

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

  const handleSend = async (e?: React.FormEvent, textMsg?: string) => {
      if (e) e.preventDefault();
      
      const msg = textMsg || inputVal.trim();
      if (!msg || isLoading) return;
      
      setMessages(prev => [...prev, { text: msg, sender: "user", id: Date.now().toString() + Math.random() }]);
      if (!textMsg) setInputVal("");
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
    <div className="flex flex-col h-screen overflow-hidden w-full bg-[#f8fafc] dark:bg-zinc-950 font-sans" style={{ '--theme-color': primaryColor } as any}>
       {/* Header Premium */}
       <div className="p-4 shadow-sm flex items-center justify-between z-10 shrink-0" style={{ backgroundColor: primaryColor, color: 'white' }}>
          <div className="flex items-center gap-3">
            <div className="relative">
              {logoUrl ? (
                 <img src={logoUrl} alt={tenantName} className="w-10 h-10 rounded-full object-cover bg-white ring-2 ring-white/20 shadow-sm" />
              ) : (
                 <div className="w-10 h-10 rounded-full bg-white/20 flex flex-col items-center justify-center text-white ring-2 ring-white/20 shadow-sm">
                     <Bot size={20} />
                 </div>
              )}
              <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-primary"></div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base leading-tight tracking-tight">{tenantName}</span>
              <span className="text-xs text-white/80 font-medium">Auto-atendimento Inteligente</span>
            </div>
          </div>
       </div>
       
       <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center text-zinc-500 text-sm mt-8 mb-6">
                <div className="w-16 h-16 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm flex items-center justify-center mb-4 border border-zinc-100 dark:border-zinc-800">
                   {logoUrl ? <img src={logoUrl} className="w-10 h-10 object-contain rounded-xl" /> : <Bot size={32} className="text-zinc-400" />}
                </div>
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-1">Boas-vindas à Vitrine Virtual!</h3>
                <p className="max-w-[250px] mx-auto opacity-80 mb-6">Estamos prontos para te atender. Escolha uma opção ou digite sua dúvida.</p>
                
                <div className="w-full max-w-sm flex flex-col gap-2">
                   {quickActions.map((action, idx) => (
                      <button 
                        key={idx}
                        onClick={() => handleSend(undefined, action)}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:border-indigo-400 dark:hover:text-indigo-400 transition-colors shadow-sm flex items-center justify-between group"
                      >
                         {action}
                         <Zap size={14} className="text-zinc-300 group-hover:text-indigo-500 transition-colors" />
                      </button>
                   ))}
                </div>
             </motion.div>
          )}
          
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
               <motion.div 
                 initial={{ opacity: 0, y: 10, scale: 0.95 }}
                 animate={{ opacity: 1, y: 0, scale: 1 }}
                 key={m.id || i} 
                 className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
               >
                  <div className={`flex gap-2 max-w-[88%] ${m.sender === 'user' ? 'flex-row-reverse' : 'flex-row'} items-end`}>
                     <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm ${m.sender === 'user' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' : 'bg-white border text-zinc-500'}`}>
                        {m.sender === 'user' ? <User size={14} /> : (logoUrl ? <img src={logoUrl} className="w-full h-full rounded-full object-cover" /> : <Bot size={14} />)}
                     </div>
                     <div 
                        className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${m.sender === 'user' ? 'rounded-2xl rounded-br-sm font-medium' : 'bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl rounded-bl-sm dark:text-zinc-200'}`} 
                        style={{ 
                            wordBreak: 'break-word', 
                            whiteSpace: 'pre-wrap',
                            ...(m.sender === 'user' ? { backgroundColor: primaryColor, color: 'white' } : {}) 
                        }}
                     >
                        {m.text}
                     </div>
                  </div>
               </motion.div>
            ))}
            
            {isLoading && (
               <motion.div 
                 initial={{ opacity: 0, y: 5 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="flex justify-start"
               >
                  <div className="flex gap-2 max-w-[85%] flex-row items-end">
                     <div className="w-7 h-7 rounded-full bg-white border flex items-center justify-center shrink-0 shadow-sm text-zinc-400">
                        {logoUrl ? <img src={logoUrl} className="w-full h-full rounded-full object-cover" /> : <Bot size={14} />}
                     </div>
                     <div className="px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5 h-[42px]">
                        <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                        <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                        <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                     </div>
                  </div>
               </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} className="h-2" />
       </div>
       
       <div className="p-3 bg-white dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
          <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto items-center">
             <div className="relative flex-1">
                <Input 
                   value={inputVal}
                   onChange={e => setInputVal(e.target.value)}
                   placeholder="Digite sua mensagem ou dúvida..."
                   className="w-full rounded-full text-[15px] bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 focus-visible:ring-2 focus-visible:ring-indigo-500 pr-12 h-12 shadow-sm" 
                   disabled={isLoading}
                />
                <Button 
                   type="submit" 
                   size="icon" 
                   className="absolute right-1 top-1 w-10 h-10 rounded-full shrink-0 border-0 transition-transform active:scale-95" 
                   disabled={isLoading || !inputVal.trim()}
                   style={(!isLoading && inputVal.trim()) ? { backgroundColor: primaryColor, color: 'white' } : {}}
                >
                   <Send size={18} className={!inputVal.trim() ? "translate-x-0.5" : "translate-x-0.5"} />
                </Button>
             </div>
          </form>
          <div className="text-center mt-2 pb-1">
             <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">⚡ Powered by Astrum Webchat</span>
          </div>
       </div>
    </div>
  );
}
