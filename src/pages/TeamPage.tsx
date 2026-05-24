
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { cn } from "@/src/lib/utils";
import { Star, RefreshCw, Trophy, Medal, Award } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Search, Plus, Mail, Activity, Phone, Trash2, Link2, ShieldAlert, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { db } from "@/src/lib/firebase";
import { collection, onSnapshot, query, updateDoc, doc, orderBy, limit } from "firebase/firestore";
import { toast } from "sonner";

export function TeamPage({ 
  setSelectedTeamMember, 
  teamMembers, 
  handleDeleteTeamMember, 
  setIsTeamMemberDialogOpen,
  teamPerformanceData,
  integrationKeys,
  setEvoStatus,
  evoStatus,
  isFetchingQr,
  evoQrCode,
  fetchEvolutionQrCode,
  newTechPhone,
  setNewTechPhone,
  newTechName,
  setNewTechName,
  isFetchingTechName,
  isAddingTech,
  setIsAddingTech,
  handleAddTechnician,
  tenantId
}: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const [liveOperators, setLiveOperators] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [metas, setMetas] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const opQuery = query(collection(db, "tenants", tenantId, "operators"));
    const unsubOps = onSnapshot(opQuery, (snap) => {
      const opsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLiveOperators(opsData);
    });

    const currentMonth = new Date().toISOString().substring(0, 7);
    const scoresQuery = query(collection(db, "gamification", tenantId, "scores"));
    const unsubScores = onSnapshot(scoresQuery, (snap) => {
       const scoresData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
       // Filter current month
       const monthlyScores = scoresData.filter((s: any) => s.month === currentMonth);
       monthlyScores.sort((a: any, b: any) => (b.points || 0) - (a.points || 0));
       setRanking(monthlyScores);
    });

    const metasQuery = query(collection(db, "tenants", tenantId, "metas"));
    const unsubMetas = onSnapshot(metasQuery, (snap) => {
       const metasData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
       setMetas(metasData.filter((m: any) => m.month === currentMonth));
    });

    return () => {
      unsubOps();
      unsubScores();
      unsubMetas();
    };
  }, [tenantId]);

  const handleRedistribute = async () => {
    toast.info("Redistribuição iniciada. Analisando fila de chamados para redistribuição aos disponíveis.");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'busy': return 'bg-red-500';
      case 'away': return 'bg-yellow-500';
      default: return 'bg-zinc-400';
    }
  };

  return (
    <motion.div 
      key="team"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <Tabs defaultValue="geral" className="w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <TabsList>
            <TabsTrigger value="geral" className="gap-2">
              <Activity size={16} /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="ranking" className="gap-2">
              <Trophy size={16} /> Ranking (Game)
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-2">
              <TrendingUp size={16} /> Metas Mensais
            </TabsTrigger>
          </TabsList>
          
          <Button className="gap-2 shrink-0 self-start md:self-auto" onClick={() => {
            setSelectedTeamMember({ name: '', email: '', role: 'support', status: 'active' });
            setIsTeamMemberDialogOpen(true);
          }}>
            <Plus size={18} /> Novo Colaborador
          </Button>
        </div>

        <TabsContent value="geral" className="space-y-6 mt-0">
          {/* PAINEL DE SUPERVISÃO EM TEMPO REAL */}
          <Card className="border-none shadow-sm bg-zinc-50/50 dark:bg-zinc-900/30">
        <CardHeader className="pb-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              Painel de Operação em Tempo Real
            </CardTitle>
            <CardDescription>Visão ao vivo do status e carga da equipe</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRedistribute} className="gap-2">
            <RefreshCw size={14} /> Redistribuir Fila
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveOperators.map(op => (
              <div key={op.id} className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar>
                      <AvatarImage src={op.avatar_url} />
                      <AvatarFallback>{op.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className={cn("absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900", getStatusColor(op.status))}></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{op.name}</p>
                    <p className="text-xs text-zinc-500 capitalize">{op.status || 'Offline'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Carga de Atendimento:</span>
                  <span className={cn(
                    "font-medium", 
                    op.current_chat_count >= op.max_concurrent_chats ? "text-red-500" : "text-indigo-600"
                  )}>
                    {op.current_chat_count || 0} / {op.max_concurrent_chats || 5}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mt-1">
                  {op.skills && op.skills.map((skill: string) => (
                    <Badge key={skill} variant="secondary" className="text-[10px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200">
                      {skill}
                    </Badge>
                  ))}
                  {(!op.skills || op.skills.length === 0) && (
                    <span className="text-[10px] text-zinc-400 italic">Sem especializações</span>
                  )}
                </div>
              </div>
            ))}
            {liveOperators.length === 0 && (
              <div className="col-span-full text-center py-6 text-zinc-500 text-sm">
                Nenhum operador configurado para roterização em tempo real.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.length > 0 ? teamMembers.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell className="pl-6 font-medium flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.photoUrl || member.avatarUrl} />
                        <AvatarFallback>{member.name[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {member.name}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {member.role === 'admin' ? 'Administrador' : 
                         member.role === 'support' ? 'Suporte' : 
                         member.role === 'billing' ? 'Financeiro' : 'Vendas'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "border-none",
                        member.status === 'active' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50"
                      )}>
                        {member.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedTeamMember(member);
                        setIsTeamMemberDialogOpen(true);
                      }}>Editar</Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => handleDeleteTeamMember(member.id)}>Remover</Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-zinc-500 dark:text-zinc-400 italic">
                      Nenhum colaborador cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Performance da Equipe</CardTitle>
            <CardDescription>Métricas individuais de atendimento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teamPerformanceData.map((perf: any, idx: number) => (
              <div key={idx} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{perf.name}</p>
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star size={12} fill="currentColor" />
                    <span className="text-xs font-bold">{perf.rating}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-400 uppercase">Tickets</p>
                    <p className="text-xs font-medium">{perf.tickets}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-400 uppercase">Tempo Médio</p>
                    <p className="text-xs font-medium">{perf.responseTime}m</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      </TabsContent>

      <TabsContent value="ranking" className="mt-0">
        <Card className="border-none shadow-sm pb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Trophy className="text-amber-500" />
              Ranking Mensal
            </CardTitle>
            <CardDescription>
              Pontuação baseada em atendimentos concluídos, FCR, avaliações e cumprimento de metas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 mt-4">
                {/* Top 3 */}
                {ranking.slice(0, 3).map((scorer, idx) => {
                   const member = teamMembers.find((m: any) => m.id === scorer.operator_id);
                   const isFirst = idx === 0;
                   return (
                     <div key={scorer.id} className={cn(
                       "flex flex-col items-center justify-center p-6 rounded-2xl border bg-white dark:bg-zinc-900 shadow-sm relative overflow-hidden",
                       isFirst ? "border-amber-200 dark:border-amber-900/50 scale-105 z-10" : "border-zinc-200 dark:border-zinc-800"
                     )}>
                       {isFirst && <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-amber-400 to-yellow-500" />}
                       
                       <div className="relative mb-4">
                          <Avatar className={cn("h-20 w-20 border-4", isFirst ? "border-amber-400" : idx === 1 ? "border-slate-300" : "border-amber-700")}>
                            <AvatarImage src={member?.photoUrl || member?.avatarUrl} />
                            <AvatarFallback>{member?.name?.[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className={cn(
                            "absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shadow-md",
                            isFirst ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : "bg-amber-700"
                          )}>
                            {idx + 1}º
                          </div>
                       </div>
                       
                       <h3 className="font-bold text-lg text-center truncate w-full px-2">{member?.name || 'Operador'}</h3>
                       <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mt-1">{scorer.points || 0} pts</p>
                       
                       <div className="flex gap-1 mt-4">
                         {(scorer.badges || []).map((badge: string, bIdx: number) => (
                            <div key={bIdx} title={badge} className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs">
                              {badge === 'NPS_5_STAR' ? '⭐' : badge === 'MENSAL_GOAL' ? '🎯' : badge === 'FCR_STAR' ? '⚡' : '🎖️'}
                            </div>
                         ))}
                       </div>
                     </div>
                   );
                })}
              </div>
            ) : (
               <div className="text-center py-12 text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-100 dark:border-zinc-800 my-4">
                 <Trophy className="w-12 h-12 mx-auto text-zinc-300 mb-3" />
                 Nenhum operador com pontuação neste mês. Acompanhe os resultados diários.
               </div>
            )}

            <div className="mt-8 border rounded-xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                  <TableRow>
                     <TableHead className="w-16 text-center">Pos</TableHead>
                     <TableHead>Operador</TableHead>
                     <TableHead>Badges</TableHead>
                     <TableHead className="text-right pr-6">Pontos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((scorer, index) => {
                     const member = teamMembers.find((m: any) => m.id === scorer.operator_id);
                     return (
                        <TableRow key={scorer.id}>
                           <TableCell className="text-center font-medium font-mono text-zinc-500">{index + 1}</TableCell>
                           <TableCell className="font-medium flex items-center gap-3">
                             <Avatar className="h-8 w-8">
                               <AvatarImage src={member?.photoUrl || member?.avatarUrl} />
                               <AvatarFallback>{member?.name?.[0]?.toUpperCase() || 'O'}</AvatarFallback>
                             </Avatar>
                             {member?.name || scorer.operator_id}
                           </TableCell>
                           <TableCell>
                             <div className="flex gap-1">
                               {(scorer.badges || []).map((badge: string, bIdx: number) => (
                                  <Badge key={bIdx} variant="outline" className="text-[10px] bg-zinc-50 dark:bg-zinc-900">
                                    {badge === 'NPS_5_STAR' ? '⭐ NPS' : badge === 'MENSAL_GOAL' ? '🎯 Meta' : badge === 'FCR_STAR' ? '⚡ FCR' : badge}
                                  </Badge>
                               ))}
                             </div>
                           </TableCell>
                           <TableCell className="text-right pr-6 font-bold text-indigo-600 dark:text-indigo-400">
                             {scorer.points || 0}
                           </TableCell>
                        </TableRow>
                     )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* METAS OVERVIEW TAB */}
      <TabsContent value="metas" className="space-y-6 mt-0">
         <Card className="border-none shadow-sm bg-zinc-50/50 dark:bg-zinc-900/30">
            <CardHeader>
               <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  <TrendingUp className="w-5 h-5 text-indigo-500" />
                  Metas do Mês 
               </CardTitle>
               <CardDescription>Acompanhe o desempenho da equipe em relação às metas</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-6">
                 {liveOperators.map(op => {
                    // Try to find goal for this operator, or fallback to default 100 resolved
                    const userMeta = metas.find(m => m.operatorId === op.id) || { target_resolution: 100, target_nps: 9.0 };
                    // We can reuse scores to simulate current progress or assume op has resolved_tickets count
                    // Let's use `op.resolved_month` if it exists, or just a mock/derived value
                    const currentResolved = op.resolved_month || 0;
                    const progress = Math.min((currentResolved / userMeta.target_resolution) * 100, 100);
                    return (
                        <div key={op.id} className="p-4 bg-white dark:bg-[#16171a] rounded-xl border border-zinc-200/50 dark:border-white/5 shadow-sm space-y-3">
                           <div className="flex items-center gap-3 justify-between">
                             <div className="flex items-center gap-3">
                                 <Avatar className="h-10 w-10">
                                    <AvatarImage src={op.avatar_url} />
                                    <AvatarFallback>{op.name?.charAt(0)}</AvatarFallback>
                                 </Avatar>
                                 <div>
                                   <p className="font-semibold">{op.name}</p>
                                   <p className="text-xs text-zinc-500">Operador</p>
                                 </div>
                             </div>
                             <div className="text-right">
                               <p className="text-sm font-medium">Realizados: {currentResolved} / <span className="text-zinc-500">{userMeta.target_resolution}</span></p>
                             </div>
                           </div>
                           <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                                <span>Progresso de Atendimentos</span>
                                <span>{progress.toFixed(0)}%</span>
                              </div>
                              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                              </div>
                           </div>
                           {progress >= 100 && (
                               <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-transparent shadow-none capitalize">
                                  Meta Batida 🎯
                               </Badge>
                           )}
                        </div>
                    );
                 })}
                 {liveOperators.length === 0 && (
                   <p className="text-sm text-zinc-500 text-center py-10">Nenhum operador com metas ativas neste mês.</p>
                 )}
               </div>
            </CardContent>
         </Card>
      </TabsContent>
      </Tabs>
    </motion.div>
  );
}
