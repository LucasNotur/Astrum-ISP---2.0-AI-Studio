import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Rule {
  id: string;
  condition_type: 'sentiment' | 'keyword' | 'ai_attempts' | 'confidence_score';
  condition_value: string;
  action: 'escalate_to_human' | 'create_urgent_os' | 'send_alert';
  active: boolean;
}

export function EscalationRulesBuilder() {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id;
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    fetchRules();
  }, [tenantId]);

  // FZ-4: regras vivem em tenants.escalation_rules (JSONB array) — mesmo storage
  // que o backend (escalationEngine/messageWorker) lê via db-compat.
  const persistRules = async (next: Rule[]) => {
    const { error } = await supabase
      .from('tenants').update({ escalation_rules: next }).eq('id', tenantId);
    if (error) throw error;
    setRules(next);
  };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('tenants').select('escalation_rules').eq('id', tenantId).maybeSingle();
      setRules(Array.isArray(data?.escalation_rules) ? data!.escalation_rules : []);
    } catch (error) {
      console.error("Error fetching rules", error);
    }
    setLoading(false);
  };

  const addRule = async () => {
    if (!tenantId) return;
    try {
      const newRule: Rule = {
        id: crypto.randomUUID(),
        condition_type: 'sentiment',
        condition_value: 'ANGRY',
        action: 'escalate_to_human',
        active: true
      };
      await persistRules([...rules, newRule]);
      toast.success("Regra criada com sucesso.");
    } catch (error) {
      console.error("Error adding rule", error);
      toast.error("Erro ao criar regra");
    }
  };

  const updateRule = async (id: string, updates: Partial<Rule>) => {
    if (!tenantId) return;
    try {
      await persistRules(rules.map(r => r.id === id ? { ...r, ...updates } : r));
      toast.success("Regra atualizada");
    } catch (error) {
      console.error("Error updating rule", error);
      toast.error("Erro ao atualizar regra");
    }
  };

  const deleteRule = async (id: string) => {
    if (!tenantId) return;
    try {
      await persistRules(rules.filter(r => r.id !== id));
      toast.success("Regra removida");
    } catch (error) {
      console.error("Error deleting rule", error);
      toast.error("Erro ao remover regra");
    }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Regras de Escalonamento Automático</CardTitle>
            <CardDescription>Defina condições para ações automáticas durante o atendimento da IA.</CardDescription>
          </div>
          <Button onClick={addRule} size="sm" className="gap-2">
            <Plus size={16} /> Nova Regra
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.length === 0 && (
          <div className="text-center py-8 text-zinc-500 border border-dashed rounded-lg">
            Nenhuma regra configurada.
          </div>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className="flex flex-col md:flex-row items-start md:items-end gap-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
            <div className="flex-1 space-y-1 w-full relative group">
              <Label>Condição</Label>
              <Select value={rule.condition_type} onValueChange={(v: any) => updateRule(rule.id, { condition_type: v, condition_value: '' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sentiment">Sentimento da Mensagem</SelectItem>
                  <SelectItem value="keyword">Contém Palavra-chave</SelectItem>
                  <SelectItem value="ai_attempts">Tentativas da IA (Loop)</SelectItem>
                  <SelectItem value="confidence_score">Confiança da IA abaixo de</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1 w-full">
              <Label>Valor</Label>
              {rule.condition_type === 'sentiment' ? (
                <Select value={rule.condition_value} onValueChange={(v) => updateRule(rule.id, { condition_value: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o sentimento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANGRY">Irritado (ANGRY)</SelectItem>
                    <SelectItem value="URGENT">Urgente (URGENT)</SelectItem>
                    <SelectItem value="NEGATIVE">Negativo (NEGATIVE)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input 
                  value={rule.condition_value} 
                  onChange={(e) => updateRule(rule.id, { condition_value: e.target.value })} 
                  placeholder={rule.condition_type === 'keyword' ? "ex: procon, cancelamento" : "ex: 3"}
                />
              )}
            </div>
            <div className="flex-1 space-y-1 w-full">
              <Label>Ação Automática</Label>
              <Select value={rule.action} onValueChange={(v: any) => updateRule(rule.id, { action: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="escalate_to_human">Transferir para Humano</SelectItem>
                  <SelectItem value="create_urgent_os">Criar OS de Urgência (Falta Sinal)</SelectItem>
                  <SelectItem value="send_alert">E-mail de Alerta p/ Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 py-2">
              <div className="flex items-center space-x-2">
                <Switch checked={rule.active} onCheckedChange={(v) => updateRule(rule.id, { active: v })} />
                <Label className="text-sm">Ativo</Label>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                <Trash2 size={18} />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
