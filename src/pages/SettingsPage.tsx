
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Ticket, Book, Globe, Clock, MessageSquare, Phone, Briefcase, Bot, Map as MapIcon, CreditCard, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Save, Bug, Database, BellRing } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsPage({ 
  integrationKeys, 
  setIntegrationKeys,
  isSavingKeys,
  handleSaveKeys,
  isDeveloper,
  seedSystem,
  seedTicketsAndLogs,
  seedServiceOrdersAndTechnicians,
  isSeeding,
  isAstrum,
  companySettings,
  setCompanySettings,
  handleSeedSystem,
  customers,
  handleSeedKB,
  evoStatus,
  fetchEvolutionQrCode,
  isFetchingQr,
  evoQrCode,
  setIsAddingTech,
  isAddingTech,
  newTechPhone,
  setNewTechPhone,
  isFetchingTechName,
  newTechName,
  setNewTechName,
  handleAddTechnician,
  technicians,
  setTechnicians,
  updateTechnician,
  setIsSavingKeys,
  saveIntegrationKeys,
  setIsTeamMemberDialogOpen,
  teamMembers,
  handleDeleteTeamMember
}: any) {
  return (
    <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <header>
                <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
                <p className="text-zinc-500 dark:text-zinc-400">Ajustes gerais da plataforma Astrum.</p>
              </header>
              
              <Tabs defaultValue="integrations" className="w-full">
                <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1">
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  {isAstrum && <TabsTrigger value="integrations">Integrações (APIs)</TabsTrigger>}
                  <TabsTrigger value="team">Equipe</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Informações da Empresa</CardTitle>
                        <CardDescription>Dados básicos que aparecem em faturas e comunicações.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Nome Fantasia</Label>
                            <Input 
                              value={companySettings.name} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>E-mail de Suporte</Label>
                            <Input 
                              value={companySettings.supportEmail} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Telefone de Contato</Label>
                            <Input 
                              value={companySettings.supportPhone} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, supportPhone: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Horário de Atendimento</Label>
                            <Input 
                              value={companySettings.workingHours} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, workingHours: e.target.value }))}
                            />
                          </div>
                        </div>
                        {isAstrum && (
                          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                            <p className="text-xs font-bold text-zinc-500 uppercase">Ferramentas de Desenvolvedor</p>
                            <div className="flex flex-wrap gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                onClick={handleSeedSystem}
                                disabled={isSeeding}
                              >
                                <Database size={14} /> Popular Clientes
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                onClick={seedTicketsAndLogs}
                                disabled={isSeeding || customers.length === 0}
                              >
                                <Ticket size={14} /> Popular Tickets/Logs
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                onClick={handleSeedKB}
                                disabled={isSeeding}
                              >
                                <Book size={14} /> Popular Base Conhecimento
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="pt-4">
                          <Button className="w-full md:w-auto">Salvar Alterações</Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Identidade Visual</CardTitle>
                        <CardDescription>Logo e cores da marca.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-32 h-32 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden relative group">
                            <img 
                              src={companySettings.logoUrl} 
                              alt="Logo" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                              <span className="text-white text-xs font-bold">Alterar</span>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-500 text-center">Recomendado: 512x512px (PNG ou SVG)</p>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Globe size={16} className="text-zinc-400" />
                              <span className="text-sm">Fuso Horário</span>
                            </div>
                            <span className="text-xs font-medium">{companySettings.timezone}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-zinc-400" />
                              <span className="text-sm">Formato de Data</span>
                            </div>
                            <span className="text-xs font-medium">DD/MM/YYYY</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {isAstrum && (
                  <TabsContent value="integrations" className="mt-6">
                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Chaves de API e Integrações</CardTitle>
                        <CardDescription>
                          Configure as chaves de API para os serviços utilizados pelo sistema. 
                          As funções do sistema buscarão essas chaves automaticamente.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <Tabs defaultValue="openai" className="w-full">
                          <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1 mb-4 flex flex-wrap gap-1">
                            <TabsTrigger value="openai">OpenAI</TabsTrigger>
                            <TabsTrigger value="gemini">Google Gemini</TabsTrigger>
                            <TabsTrigger value="whatsapp">WhatsApp (Evolution)</TabsTrigger>
                            <TabsTrigger value="billing">Financeiro (ERP)</TabsTrigger>
                            <TabsTrigger value="maps">Google Maps</TabsTrigger>
                            <TabsTrigger value="ragdb">Motor RAG (Busca e IA)</TabsTrigger>
                          </TabsList>

                          <TabsContent value="openai" className="space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor="openai-chat-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-emerald-600" />
                                OpenAI API Key (Motor do Agente)
                              </Label>
                              <Input 
                                id="openai-chat-key" 
                                type="password" 
                                placeholder="sk-proj-..." 
                                value={integrationKeys.openaiChat || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiChat: e.target.value }))}
                              />
                              <div className="flex gap-2 items-center mt-1">
                                <Label htmlFor="openai-chat-model" className="text-xs text-zinc-500 w-16">Modelo:</Label>
                                <Input 
                                  id="openai-chat-model" 
                                  placeholder="ex: gpt-4o-mini" 
                                  className="h-7 text-xs"
                                  value={integrationKeys.openaiChatModel || 'gpt-4o-mini'}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiChatModel: e.target.value }))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Motor principal de conversação com o cliente.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="openai-orchestrator-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-emerald-600" />
                                OpenAI API Key (Orquestrador)
                              </Label>
                              <Input 
                                id="openai-orchestrator-key" 
                                type="password" 
                                placeholder="sk-proj-..." 
                                value={integrationKeys.openaiOrchestrator || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiOrchestrator: e.target.value }))}
                              />
                              <div className="flex gap-2 items-center mt-1">
                                <Label htmlFor="openai-orchestrator-model" className="text-xs text-zinc-500 w-16">Modelo:</Label>
                                <Input 
                                  id="openai-orchestrator-model" 
                                  placeholder="ex: gpt-4o-mini" 
                                  className="h-7 text-xs"
                                  value={integrationKeys.openaiOrchestratorModel || 'gpt-4o-mini'}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiOrchestratorModel: e.target.value }))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Classifica o sentimento e a categoria da primeira mensagem.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="openai-whisper-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-emerald-600" />
                                OpenAI API Key (Transcrição de Áudio)
                              </Label>
                              <Input 
                                id="openai-whisper-key" 
                                type="password" 
                                placeholder="sk-proj-..." 
                                value={integrationKeys.openaiWhisper || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiWhisper: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Transcreve áudios do WhatsApp para texto (Whisper).</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="gemini" className="space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor="gemini-summary-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-purple-600" />
                                Google Gemini API Key (Resumo de Tickets)
                              </Label>
                              <Input 
                                id="gemini-summary-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.geminiSummary || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiSummary: e.target.value }))}
                              />
                              <div className="flex gap-2 items-center mt-1">
                                <Label htmlFor="gemini-summary-model" className="text-xs text-zinc-500 w-16">Modelo:</Label>
                                <Input 
                                  id="gemini-summary-model" 
                                  placeholder="ex: gemini-2.5-flash" 
                                  className="h-7 text-xs"
                                  value={integrationKeys.geminiSummaryModel || 'gemini-2.5-flash'}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiSummaryModel: e.target.value }))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Gera resumos rápidos do histórico de atendimento.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="gemini-smartreply-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-purple-600" />
                                Google Gemini API Key (Respostas Rápidas)
                              </Label>
                              <Input 
                                id="gemini-smartreply-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.geminiSmartReply || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiSmartReply: e.target.value }))}
                              />
                              <div className="flex gap-2 items-center mt-1">
                                <Label htmlFor="gemini-smartreply-model" className="text-xs text-zinc-500 w-16">Modelo:</Label>
                                <Input 
                                  id="gemini-smartreply-model" 
                                  placeholder="ex: gemini-2.5-flash" 
                                  className="h-7 text-xs"
                                  value={integrationKeys.geminiSmartReplyModel || 'gemini-2.5-flash'}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiSmartReplyModel: e.target.value }))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Sugere respostas prontas para os atendentes humanos.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="gemini-kb-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-purple-600" />
                                Google Gemini API Key (Base de Conhecimento)
                              </Label>
                              <Input 
                                id="gemini-kb-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.geminiKb || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiKb: e.target.value }))}
                              />
                              <div className="flex gap-2 items-center mt-1">
                                <Label htmlFor="gemini-kb-model" className="text-xs text-zinc-500 w-16">Modelo:</Label>
                                <Input 
                                  id="gemini-kb-model" 
                                  placeholder="ex: gemini-2.5-flash" 
                                  className="h-7 text-xs"
                                  value={integrationKeys.geminiKbModel || 'gemini-2.5-flash'}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiKbModel: e.target.value }))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Gera artigos para a base de conhecimento a partir de tickets resolvidos.</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="whatsapp" className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <div className="grid gap-2">
                                  <Label htmlFor="evo-url" className="flex items-center gap-2">
                                    <MessageSquare size={16} className="text-green-600" />
                                    Evolution API URL
                                  </Label>
                                  <Input 
                                    id="evo-url" 
                                    placeholder="ex: http://sua-vps:8080" 
                                    value={integrationKeys.evolutionUrl || ''}
                                    onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionUrl: e.target.value }))}
                                  />
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">URL base da sua Evolution API.</p>
                                </div>

                                <div className="grid gap-2">
                                  <Label htmlFor="evo-instance" className="flex items-center gap-2">
                                    <MessageSquare size={16} className="text-green-600" />
                                    Nome da Instância
                                  </Label>
                                  <Input 
                                    id="evo-instance" 
                                    placeholder="ex: Astrum" 
                                    value={integrationKeys.evolutionInstance || ''}
                                    onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionInstance: e.target.value }))}
                                  />
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Nome exato da instância criada na Evolution.</p>
                                </div>

                                <div className="grid gap-2">
                                  <Label htmlFor="evo-apikey" className="flex items-center gap-2">
                                    <MessageSquare size={16} className="text-green-600" />
                                    Global API Key
                                  </Label>
                                  <Input 
                                    id="evo-apikey" 
                                    type="password" 
                                    placeholder="Sua Global API Key..." 
                                    value={integrationKeys.evolutionApiKey || ''}
                                    onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
                                  />
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Chave global de autenticação da Evolution API.</p>
                                </div>

                                <div className="grid gap-2">
                                  <Label htmlFor="support-relay-number" className="flex items-center gap-2">
                                    <Phone size={16} className="text-blue-600" />
                                    WhatsApp de Suporte Nível 2 (Relay)
                                  </Label>
                                  <Input 
                                    id="support-relay-number" 
                                    placeholder="ex: 5511999999999" 
                                    value={integrationKeys.whiteLabelSupportNumber || ''}
                                    onChange={(e) => setIntegrationKeys(prev => ({ ...prev, whiteLabelSupportNumber: e.target.value }))}
                                  />
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Número que receberá as dúvidas que a IA não souber responder.</p>
                                </div>
                              </div>
                              
                              <div className="bg-zinc-50 dark:bg-zinc-900 border rounded-lg p-6 flex flex-col items-center justify-center text-center space-y-4">
                                <h4 className="font-semibold text-zinc-900 dark:text-zinc-50">Conexão do WhatsApp</h4>
                                
                                {evoStatus === "connected" ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                      <MessageSquare size={32} className="text-green-600" />
                                    </div>
                                    <p className="text-sm font-medium text-green-600">Instância Conectada!</p>
                                    <Button variant="outline" size="sm" onClick={fetchEvolutionQrCode} disabled={isFetchingQr}>
                                      Verificar Status
                                    </Button>
                                  </div>
                                ) : evoQrCode ? (
                                  <div className="flex flex-col items-center gap-4">
                                    <div className="bg-white p-2 rounded-xl shadow-sm border">
                                      <img src={evoQrCode.startsWith('data:image') ? evoQrCode : `data:image/png;base64,${evoQrCode}`} alt="WhatsApp QR Code" className="w-48 h-48" />
                                    </div>
                                    <p className="text-sm text-zinc-500">Escaneie o QR Code com o seu WhatsApp.</p>
                                    <Button variant="outline" size="sm" onClick={fetchEvolutionQrCode} disabled={isFetchingQr}>
                                      Gerar Novo QR Code
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-2">
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                      Salve as configurações ao lado e clique abaixo para gerar o QR Code.
                                    </p>
                                    <Button onClick={fetchEvolutionQrCode} disabled={isFetchingQr}>
                                      {isFetchingQr ? "Conectando..." : "Gerar QR Code"}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h3 className="text-sm font-bold flex items-center gap-2">
                                    <Briefcase size={16} className="text-zinc-400" />
                                    Técnicos de Campo (WhatsApp)
                                  </h3>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                    Configure os números de WhatsApp dos técnicos para envio automático de OS.
                                  </p>
                                </div>
                                <Button size="sm" onClick={() => setIsAddingTech(!isAddingTech)}>
                                  {isAddingTech ? "Cancelar" : "+ Técnico"}
                                </Button>
                              </div>
                              
                              {isAddingTech && (
                                <div className="mb-6 p-4 border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl">
                                  <h4 className="text-sm font-bold mb-3 text-blue-800 dark:text-blue-300">Novo Técnico</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                      <Label className="text-xs">Número WhatsApp <span className="text-red-500">*</span></Label>
                                      <Input 
                                        placeholder="5511999999999" 
                                        value={newTechPhone}
                                        onChange={(e) => setNewTechPhone(e.target.value.replace(/\D/g, ''))}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-xs">Nome {isFetchingTechName && <span className="text-blue-500 text-[10px] animate-pulse">Buscando...</span>}</Label>
                                      <Input 
                                        placeholder="Opcional (Buscado via API)" 
                                        value={newTechName}
                                        onChange={(e) => setNewTechName(e.target.value)}
                                        disabled={isFetchingTechName}
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <Button 
                                        className="w-full" 
                                        onClick={handleAddTechnician}
                                      >
                                        Adicionar
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {technicians.map((tech, index) => (
                                  <div key={tech.id} className="grid gap-2 p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
                                    <Label htmlFor={`tech-phone-${tech.id}`} className="text-xs font-bold">
                                      {tech.name}
                                    </Label>
                                    <Input 
                                      id={`tech-phone-${tech.id}`} 
                                      placeholder="ex: 5511999999999" 
                                      value={tech.phone}
                                      onChange={(e) => {
                                        const newTechs = [...technicians];
                                        newTechs[index].phone = e.target.value;
                                        setTechnicians(newTechs);
                                      }}
                                      onBlur={async (e) => {
                                        try {
                                          await updateTechnician(tech.id, { phone: e.target.value });
                                          toast.success(`Telefone do ${tech.name} salvo.`);
                                        } catch (err) {
                                          toast.error(`Erro ao salvar telefone do ${tech.name}.`);
                                        }
                                      }}
                                    />
                                    <div className="flex items-center gap-2 mt-2">
                                      <div className={`w-2 h-2 rounded-full ${tech.status === 'available' ? 'bg-green-500' : tech.status === 'break' ? 'bg-yellow-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                                        {tech.status === 'available' ? 'Disponível' : tech.status === 'break' ? 'Em Pausa' : 'Offline'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="billing" className="space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor="billing-query-key" className="flex items-center gap-2">
                                <CreditCard size={16} className="text-indigo-600" />
                                API Banco / ERP (Consulta de Faturas)
                              </Label>
                              <Input 
                                id="billing-query-key" 
                                type="password" 
                                placeholder="Chave para consulta..." 
                                value={integrationKeys.billingQuery || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, billingQuery: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para buscar faturas e status financeiro.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="billing-payment-key" className="flex items-center gap-2">
                                <CreditCard size={16} className="text-indigo-600" />
                                API Banco / ERP (Registro de Pagamentos)
                              </Label>
                              <Input 
                                id="billing-payment-key" 
                                type="password" 
                                placeholder="Chave para registro..." 
                                value={integrationKeys.billingPayment || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, billingPayment: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para confirmar recebimentos no sistema.</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="maps" className="space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor="google-maps-view-key" className="flex items-center gap-2">
                                <MapIcon size={16} className="text-blue-600" />
                                Google Maps API Key (Visualização)
                              </Label>
                              <Input 
                                id="google-maps-view-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.mapsView || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mapsView: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para renderizar o mapa de cobertura.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="google-maps-geocode-key" className="flex items-center gap-2">
                                <MapIcon size={16} className="text-blue-600" />
                                Google Maps API Key (Geocodificação)
                              </Label>
                              <Input 
                                id="google-maps-geocode-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.mapsGeocode || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mapsGeocode: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para converter endereços em coordenadas.</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="ragdb" className="space-y-6">
                            <div className="grid gap-2">
                              <Label htmlFor="rag-db-key" className="flex items-center gap-2">
                                <Database size={16} className="text-indigo-600 dark:text-indigo-400" />
                                Chave de API da Ferramenta de Busca (Vetor)
                              </Label>
                              <Input 
                                id="rag-db-key" 
                                type="password" 
                                placeholder="ex: chave do Pinecone, Supabase..." 
                                value={integrationKeys.ragDbKey || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, ragDbKey: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Ferramenta que faz as buscas para o RAG no banco de dados vetorial do sistema.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="rag-ai-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-indigo-600 dark:text-indigo-400" />
                                Chave de API da IA do RAG (Varredura e Extração)
                              </Label>
                              <Input 
                                id="rag-ai-key" 
                                type="password" 
                                placeholder="ex: chave da OpenAI, Anthropic, Gemini..." 
                                value={integrationKeys.ragAiKey || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, ragAiKey: e.target.value }))}
                              />
                              <div className="flex gap-2 items-center mt-1">
                                <Label htmlFor="rag-ai-model" className="text-xs text-zinc-500 w-16">Modelo:</Label>
                                <Input 
                                  id="rag-ai-model" 
                                  placeholder="ex: gpt-4o, claude-3-5-sonnet, gemini-2.5-flash" 
                                  className="h-7 text-xs"
                                  value={integrationKeys.ragAiModel || ''}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, ragAiModel: e.target.value }))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Motor de IA usado para ler manuais, PDFs e vetorizar dados no sistema de RAG.</p>
                            </div>
                          </TabsContent>
                        </Tabs>

                        <Button 
                          onClick={async () => {
                            setIsSavingKeys(true);
                            await saveIntegrationKeys(integrationKeys);
                            setIsSavingKeys(false);
                            toast.success("Chaves de integração salvas com sucesso!");
                          }}
                          disabled={isSavingKeys}
                        >
                          {isSavingKeys ? "Salvando..." : "Salvar Configurações"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                <TabsContent value="team" className="mt-6">
                  <Card className="border-none shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Membros da Equipe</CardTitle>
                        <CardDescription>Gerencie quem tem acesso ao dashboard e seus níveis de permissão.</CardDescription>
                      </div>
                      <Button onClick={() => setIsTeamMemberDialogOpen(true)} className="gap-2">
                        <Plus size={18} /> Novo Membro
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teamMembers.map((member) => (
                          <div key={member.id} className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                {member.name?.slice(0, 2).toUpperCase() || '??'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{member.name}</p>
                              <p className="text-[10px] text-zinc-500 truncate">{member.email}</p>
                              <Badge variant="secondary" className="mt-1 text-[8px] h-4">{member.role}</Badge>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-zinc-400 hover:text-red-600"
                              onClick={() => handleDeleteTeamMember(member.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        ))}
                        {teamMembers.length === 0 && (
                          <div className="col-span-full py-12 text-center border-2 border-dashed rounded-2xl border-zinc-100">
                            <Users size={32} className="mx-auto text-zinc-200 mb-2" />
                            <p className="text-zinc-400 text-sm">Nenhum membro cadastrado.</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </motion.div>
          
  );
}
