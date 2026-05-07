
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Search, Sparkles, Plus } from 'lucide-react';

export function KnowledgeBasePage({ knowledgeBase, handleGenerateAIArticle, handleSeedKB }: any) {
  return (
    <motion.div 
              key="kb"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <header className="flex items-center justify-between">
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="gap-2 text-purple-600 border-purple-200" onClick={handleGenerateAIArticle}>
                    <Sparkles size={18} /> Gerar Artigo IA
                  </Button>
                  <Button className="gap-2" onClick={handleSeedKB}>
                    <Plus size={18} /> Novo Artigo
                  </Button>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 border-none shadow-sm">
                  <CardHeader>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                      <Input placeholder="Buscar artigos..." className="pl-10" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4">
                      {knowledgeBase.map(article => (
                        <div key={article.id} className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:shadow-md transition-all cursor-pointer group">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold group-hover:text-primary transition-colors">{article.title}</h3>
                            <Badge variant="secondary">{article.category}</Badge>
                          </div>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4">{article.content}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                              {article.tags?.map((tag: string) => (
                                <span key={`tag-${tag}`}>
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    {`#${tag}`}
                                  </Badge>
                                </span>
                              ))}
                            </div>
                            <Button variant="ghost" size="sm" className="h-8 text-xs">Editar</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-none shadow-sm bg-primary text-primary-foreground">
                    <CardHeader>
                      <CardTitle className="text-lg">Status do RAG</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm opacity-80">Artigos Indexados</span>
                        <span className="text-2xl font-bold">{knowledgeBase.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm opacity-80">Última Sincronização</span>
                        <span className="text-sm font-medium">Hoje, 14:20</span>
                      </div>
                      <Button variant="secondary" className="w-full mt-2">Sincronizar Agora</Button>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">Categorias</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {['Suporte', 'Vendas', 'Financeiro', 'Geral'].map(cat => (
                        <div key={cat} className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors">
                          <span className="text-sm">{cat}</span>
                          <Badge variant="outline" className="text-[10px]">{knowledgeBase.filter(a => a.category === cat).length}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          
  );
}
