const fs = require('fs');

let content = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf-8');

const startIdx = content.indexOf(") : dashboardSubTab === 'performance' ? (");

// The churn view starts after this:
const churnStartIdx = content.indexOf('             <div className="space-y-6">\n                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">\n                  <StatCard loading={loading} title="Risco Alto de Churn"', startIdx);

const endIdx = content.lastIndexOf('          ) : (\n', churnStartIdx);

const replacement = `          ) : dashboardSubTab === 'performance' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-none shadow-sm flex flex-col justify-between">
                  <CardHeader>
                    <CardTitle>Performance da IA</CardTitle>
                    <CardDescription>Tempo de resposta e análise de sentimento (Astrum Engine)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Tempo Médio (SLA)</p>
                        <p className="text-2xl font-bold">{avgResponseTime.toFixed(2)}s</p>
                      </div>
                      <Badge className={cn(
                        "border-none",
                        avgResponseTime < 2 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      )}>
                        {avgResponseTime < 2 ? "Dentro do SLA" : "Fora do SLA"}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Sentimento Positivo</span>
                        <span>{sentimentStats.POSITIVO}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-500" style={{ width: \`\${sentimentStats.POSITIVO}%\` }} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Sentimento Neutro</span>
                        <span>{sentimentStats.NEUTRO}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-400 transition-all duration-500" style={{ width: \`\${sentimentStats.NEUTRO}%\` }} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span>Sentimento Negativo</span>
                        <span>{sentimentStats.NEGATIVO}%</span>
                      </div>
                      <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: \`\${sentimentStats.NEGATIVO}%\` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm flex flex-col justify-between">
                  <CardHeader>
                    <CardTitle>Análise de Sentimento</CardTitle>
                    <CardDescription>Humor predominante nos atendimentos.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-center py-4">
                      <div className="relative w-40 h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Positivo', value: sentimentCounts.POSITIVO, color: '#10b981' },
                                { name: 'Neutro', value: sentimentCounts.NEUTRO, color: '#94a3b8' },
                                { name: 'Negativo', value: sentimentCounts.NEGATIVO, color: '#ef4444' },
                              ]}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {[
                                { name: 'Positivo', value: sentimentCounts.POSITIVO, color: '#10b981' },
                                { name: 'Neutro', value: sentimentCounts.NEUTRO, color: '#94a3b8' },
                                { name: 'Negativo', value: sentimentCounts.NEGATIVO, color: '#ef4444' },
                              ].map((entry, index) => (
                                <Cell key={\`cell-\${index}\`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-2xl font-bold">{(sentimentCounts.POSITIVO / ((sentimentCounts.POSITIVO + sentimentCounts.NEUTRO + sentimentCounts.NEGATIVO) || 1) * 100).toFixed(0)}%</p>
                          <p className="text-[10px] text-zinc-500 uppercase font-bold">Positivo</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span>Satisfeito</span>
                        </div>
                        <span className="font-bold">{sentimentCounts.POSITIVO}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-zinc-400" />
                          <span>Neutro</span>
                        </div>
                        <span className="font-bold">{sentimentCounts.NEUTRO}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span>Insatisfeito</span>
                        </div>
                        <span className="font-bold">{sentimentCounts.NEGATIVO}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-none shadow-sm flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-orange-500" />
                      Risco de Quebra de SLA
                    </CardTitle>
                    <CardDescription>Tickets abertos há mais de 4 horas sem resolução.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {slaRiskTickets.length > 0 ? (
                        slaRiskTickets.slice(0, 3).map(t => (
                          <div key={t.id} className="relative flex items-center justify-between p-4 rounded-[16px] bg-white dark:bg-[#16171a] shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden ticket-shape">
                            <div className="absolute top-0 bottom-0 left-3 border-l border-dashed border-zinc-200 dark:border-white/5" />
                            <div className="flex items-center gap-4 pl-2 relative z-10 w-full">
                              <div className="w-8 shrink-0 flex items-center justify-center">
                                <span className={cn(
                                  "w-1.5 h-10 rounded-full",
                                  t.priority === 'urgent' ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" : "bg-orange-500"
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-mono font-bold text-zinc-400 mb-0.5">#{t.id.slice(0, 5)}</p>
                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px] sm:max-w-[200px]">{t.subject}</p>
                                <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 w-fit px-2 py-0.5 rounded-full mt-1.5">
                                  Aberto há {Math.floor((Date.now() - (t.createdAt?.seconds * 1000)) / (1000 * 60 * 60))} horas
                                </p>
                              </div>
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                className="h-8 text-xs font-bold shrink-0 shadow-sm"
                                onClick={() => { setSelectedTicket(t); setIsTicketDetailOpen(true); }}
                              >
                                Priorizar
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle2 size={32} className="mx-auto text-green-500 mb-2" />
                          <p className="text-sm text-zinc-500">Nenhum ticket em risco crítico.</p>
                        </div>
                      )}
                      {slaRiskTickets.length > 3 && (
                        <p className="text-[10px] text-center text-zinc-400">+{slaRiskTickets.length - 3} outros tickets em risco</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm flex flex-col">
                  <CardHeader>
                    <CardTitle>Atividade Recente</CardTitle>
                    <CardDescription>Últimas movimentações no sistema.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px] pr-4">
                      <div className="space-y-4">
                        {auditLogs.slice(0, 10).map((log, i) => (
                          <div key={log.id} className="flex gap-3 relative">
                            {i !== 9 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-100 dark:bg-zinc-800" />}
                            <div className={cn(
                              "w-8 h-8 rounded-full shrink-0 flex items-center justify-center border-2 border-white dark:border-zinc-900 z-10",
                              log.sentiment === 'POSITIVO' ? "bg-green-100 text-green-600" : 
                              log.sentiment === 'NEGATIVO' ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600"
                            )}>
                              {log.sentiment === 'POSITIVO' ? <CheckCircle2 size={14} /> : 
                               log.sentiment === 'NEGATIVO' ? <TrendingDown size={14} /> : <MessageSquare size={14} />}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                {log.category === 'FATURA' ? 'Consulta Financeira' : 
                                 log.category === 'SUPORTE_TECNICO' ? 'Suporte Técnico' : 'Atendimento Geral'}
                              </p>
                              <p className="text-[10px] text-zinc-500 line-clamp-1">
                                {log.ticketId ? \`Ticket #\${log.ticketId.slice(0, 8)}\` : log.action} 
                                {log.sentiment && \` - Sentimento \${log.sentiment.toLowerCase()}\`}
                              </p>
                              <p className="text-[10px] text-zinc-400">{log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString() : 'Agora'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {isOwner && (
                <div className="grid grid-cols-1">
                  <Card className="border-none shadow-sm flex flex-col">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Tickets Críticos</CardTitle>
                        <CardDescription>Chamados urgentes que precisam de atenção imediata.</CardDescription>
                      </div>
                      <Badge className="bg-red-500 border-none">Urgente</Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {tickets.filter(t => t.priority === 'high' || t.priority === 'urgent').length > 0 ? (
                          tickets.filter(t => t.priority === 'high' || t.priority === 'urgent')
                            .slice(0, 4)
                            .map(t => (
                              <div key={t.id} className="relative flex items-center justify-between p-4 rounded-[16px] bg-white dark:bg-[#16171a] shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden ticket-shape">
                                <div className="absolute top-0 bottom-0 left-3 border-l border-dashed border-zinc-200 dark:border-white/5" />
                                <div className="flex items-center gap-4 pl-2 relative z-10">
                                  <div className="w-8 shrink-0 flex items-center justify-center">
                                    <span className={cn(
                                      "w-1.5 h-10 rounded-full",
                                      t.priority === 'urgent' ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" : "bg-orange-500"
                                    )} />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-mono font-bold text-zinc-400 mb-0.5">#{t.id.slice(0, 5)}</p>
                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">{t.subject}</p>
                                    <p className="text-[10px] font-medium text-zinc-500 mt-1">{customers.find(c => c.id === t.customerId)?.name || 'Cliente Desconhecido'}</p>
                                  </div>
                                </div>
                                <Button variant="secondary" size="sm" className="h-8 text-xs font-bold shrink-0 z-10" onClick={() => {
                                  setSelectedTicket(t);
                                  navigate('/tickets');
                                }}>Ver</Button>
                              </div>
                            ))
                        ) : (
                          <div className="text-center py-8 text-zinc-400 text-sm italic">
                            Nenhum ticket crítico no momento.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
`;

content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync('src/pages/DashboardPage.tsx', content);

console.log('Fixed Dashboard');
