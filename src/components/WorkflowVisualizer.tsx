import React from 'react';
import { motion } from 'motion/react';
import { 
  Webhook, 
  Cpu, 
  Zap, 
  ShieldAlert, 
  MessageSquare, 
  Database, 
  ArrowRight, 
  Bot, 
  Settings, 
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

interface NodeProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  type: 'trigger' | 'process' | 'agent' | 'output' | 'error';
  active?: boolean;
}

const Node = ({ icon, title, description, type, active = false }: NodeProps) => {
  const colors = {
    trigger: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
    process: 'bg-purple-500/10 border-purple-500/20 text-purple-500',
    agent: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
    output: 'bg-zinc-500/10 border-zinc-500/20 text-zinc-500',
    error: 'bg-red-500/10 border-red-500/20 text-red-500',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className={cn(
        "relative p-4 rounded-2xl border bg-white dark:bg-zinc-900 shadow-sm w-64 z-10",
        active ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-zinc-950" : ""
      )}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", colors[type])}>
        {icon}
      </div>
      <h4 className="text-sm font-bold mb-1">{title}</h4>
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{description}</p>
      
      {active && (
        <motion.div 
          layoutId="pulse"
          className="absolute -inset-1 rounded-2xl border-2 border-primary/30 z-[-1]"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
};

const Connection = ({ vertical = false, animated = true }: { vertical?: boolean, animated?: boolean }) => {
  return (
    <div className={cn("flex items-center justify-center", vertical ? "h-12 w-full" : "w-12 h-full")}>
      <div className={cn("relative", vertical ? "h-full w-px bg-zinc-200 dark:bg-zinc-800" : "w-full h-px bg-zinc-200 dark:bg-zinc-800")}>
        {animated && (
          <motion.div 
            className={cn("absolute bg-primary rounded-full", vertical ? "w-1 h-3 left-[-1.5px]" : "h-1 w-3 top-[-1.5px]")}
            animate={vertical ? { y: [0, 48] } : { x: [0, 48] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>
    </div>
  );
};

export const WorkflowVisualizer = () => {
  return (
    <div className="p-8 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-3xl border border-zinc-100 dark:border-zinc-900 overflow-x-auto no-scrollbar">
      <div className="min-w-[1000px] flex flex-col items-center gap-8">
        
        {/* Entry Layer */}
        <div className="flex items-center">
          <Node 
            icon={<Webhook size={20} />} 
            title="Webhook (Evolution API)" 
            description="Recebe mensagens via WhatsApp em tempo real. Gatilho inicial do fluxo."
            type="trigger"
            active
          />
          <Connection />
          <Node 
            icon={<Cpu size={20} />} 
            title="Pré-Processamento" 
            description="Limpeza de texto, detecção de idioma e extração de metadados."
            type="process"
          />
        </div>

        <Connection vertical />

        {/* Orchestration Layer */}
        <div className="flex items-center">
          <Node 
            icon={<Zap size={20} />} 
            title="Orquestrador Astrum" 
            description="Classifica a intenção (Vendas, Suporte, Financeiro) e analisa o sentimento."
            type="process"
            active
          />
        </div>

        <div className="flex gap-20 mt-4 relative">
          {/* Connection Lines to Agents */}
          <div className="absolute top-[-32px] left-1/2 -translate-x-1/2 w-[80%] h-8 border-x border-t border-zinc-200 dark:border-zinc-800 rounded-t-2xl" />
          
          <div className="flex flex-col items-center gap-4">
            <Node 
              icon={<Bot size={20} />} 
              title="Agente de Suporte" 
              description="Especialista em diagnóstico técnico e base de conhecimento RAG."
              type="agent"
            />
            <Connection vertical animated={false} />
            <Node 
              icon={<Search size={20} />} 
              title="RAG Engine" 
              description="Consulta manuais e FAQs para respostas precisas."
              type="process"
            />
          </div>

          <div className="flex flex-col items-center gap-4">
            <Node 
              icon={<Bot size={20} />} 
              title="Agente Financeiro" 
              description="Integrado ao ERP para consulta de faturas e códigos PIX."
              type="agent"
            />
            <Connection vertical animated={false} />
            <Node 
              icon={<Database size={20} />} 
              title="ERP Integration" 
              description="Conexão segura com o banco de dados financeiro."
              type="process"
            />
          </div>

          <div className="flex flex-col items-center gap-4">
            <Node 
              icon={<Bot size={20} />} 
              title="Agente de Vendas" 
              description="Focado em conversão e verificação de viabilidade técnica."
              type="agent"
            />
            <Connection vertical animated={false} />
            <Node 
              icon={<Settings size={20} />} 
              title="Viabilidade API" 
              description="Consulta Google Maps e Geofencing para cobertura."
              type="process"
            />
          </div>
        </div>

        <Connection vertical />

        {/* MCP Layer */}
        <div className="flex items-center">
          <Node 
            icon={<Zap size={20} />} 
            title="MCP (Model Context Protocol)" 
            description="Camada de abstração para ferramentas externas e execução de funções."
            type="process"
            active
          />
        </div>

        <Connection vertical />

        {/* Final Layer */}
        <div className="flex gap-12">
          <Node 
            icon={<ShieldAlert size={20} />} 
            title="Error Handler / Fallback" 
            description="Se a confiança for baixa, escala para atendimento humano."
            type="error"
          />
          <Node 
            icon={<MessageSquare size={20} />} 
            title="Resposta Final" 
            description="Mensagem formatada enviada de volta ao cliente via WhatsApp."
            type="output"
          />
        </div>

        {/* Legend */}
        <div className="mt-12 flex gap-6 p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium">Entrada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-[10px] font-medium">Processamento</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium">Agentes Especialistas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-[10px] font-medium">Contingência</span>
          </div>
        </div>
      </div>
    </div>
  );
};
