
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { cn } from "@/src/lib/utils";
import { Star } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Search, Plus, Mail, Activity, Phone, Trash2, Link2, ShieldAlert } from 'lucide-react';

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
  handleAddTechnician
}: any) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <motion.div 
              key="team"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Equipe</h1>
                  <p className="text-zinc-500 dark:text-zinc-400">Gerencie os acessos e permissões dos seus colaboradores.</p>
                </div>
                <Button className="gap-2 shrink-0 self-start md:self-auto" onClick={() => {
                  setSelectedTeamMember({ name: '', email: '', role: 'support', status: 'active' });
                  setIsTeamMemberDialogOpen(true);
                }}>
                  <Plus size={18} /> Novo Colaborador
                </Button>
              </header>
              
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
                        {teamMembers.length > 0 ? teamMembers.map(member => (
                          <TableRow key={member.id}>
                            <TableCell className="pl-6 font-medium flex items-center gap-3">
                              <Avatar className="h-8 w-8">
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
                    {teamPerformanceData.map((perf, idx) => (
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
            </motion.div>
          
  );
}
