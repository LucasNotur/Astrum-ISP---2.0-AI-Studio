import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Plus, Download, Upload, Box, Trash2, TrendingUp, TrendingDown,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Label } from '@/src/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/src/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/src/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/src/components/ui/dialog';
import { cn } from '@/src/lib/utils';
import { supabase } from '@/src/lib/supabase';
import { useAppStore } from '@/src/store/useAppStore';
import {
  getInventory as sbGetInventory,
} from '@/src/lib/supabaseDb';
import {
  updateInventoryItem,
  createInventoryItem,
  deleteInventoryItem,
  logAudit,
} from '@/src/lib/db';

// Normaliza campos snake_case (Supabase) ↔ camelCase (estado local)
function norm(item: any) {
  return {
    ...item,
    minStock: item.minStock ?? item.min_stock ?? 0,
    unit: item.unit ?? 'un',
  };
}

const EMPTY_ITEM = { name: '', category: 'ONU', stock: 0, minStock: 5, unit: 'un', price: 0 };

export function InventoryPage() {
  const userProfile     = useAppStore((s) => s.userProfile);
  const companySettings = useAppStore((s) => s.companySettings);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const notifications    = useAppStore((s) => s.notifications);
  const setConfirmDialog = useAppStore((s) => s.setConfirmDialog);

  const tenantId = companySettings?.tenant_id || userProfile?.tenantId || 'default';

  const [inventory, setInventory]                 = useState<any[]>([]);
  const [selectedItem, setSelectedItem]           = useState<any>(null);
  const [adjustmentAmount, setAdjustmentAmount]   = useState(0);
  const [isAdjustOpen, setIsAdjustOpen]           = useState(false);
  const [isNewItemOpen, setIsNewItemOpen]         = useState(false);
  const [isImporting, setIsImporting]             = useState(false);
  const [newItem, setNewItem]                     = useState({ ...EMPTY_ITEM });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscription Supabase em tempo real
  useEffect(() => {
    const unsub = sbGetInventory(
      (rows) => setInventory(rows.map(norm)),
      tenantId,
    );
    return () => unsub();
  }, [tenantId]);

  // Alertas de estoque baixo
  useEffect(() => {
    inventory.forEach((item) => {
      if (item.stock <= item.minStock) {
        const already = notifications.some(
          (n: any) => n.type === 'warning' && n.message.includes(item.name),
        );
        if (!already) {
          setNotifications((prev: any[]) => [
            {
              id: Math.random().toString(36).slice(2),
              title: 'Estoque Baixo',
              message: `O item ${item.name} atingiu o nível crítico (${item.stock} ${item.unit}).`,
              type: 'warning',
              time: 'Agora',
              read: false,
            },
            ...prev,
          ]);
        }
      }
    });
  }, [inventory]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    inventory.forEach((i) => { map[i.category] = (map[i.category] || 0) + i.stock; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [inventory]);

  const totalValue = inventory.reduce((acc, i) => acc + i.stock * i.price, 0);

  // --- Handlers ---

  const handleAdjust = async () => {
    if (!selectedItem) return;
    const newStock = selectedItem.stock + adjustmentAmount;
    try {
      await updateInventoryItem(selectedItem.id, { stock: newStock });
      await logAudit('INVENTORY_ADJUSTED', {
        itemId: selectedItem.id, itemName: selectedItem.name,
        oldStock: selectedItem.stock, newStock,
      });
      toast.success('Estoque atualizado com sucesso!');
      setIsAdjustOpen(false);
    } catch {
      toast.error('Erro ao atualizar estoque.');
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name) { toast.error('O nome do item é obrigatório.'); return; }
    try {
      const id = await createInventoryItem(newItem);
      await logAudit('INVENTORY_ITEM_CREATED', { itemId: id, itemName: newItem.name });
      setIsNewItemOpen(false);
      setNewItem({ ...EMPTY_ITEM });
      toast.success('Item adicionado ao estoque!');
    } catch {
      toast.error('Erro ao adicionar item.');
    }
  };

  const handleDelete = (item: any) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remover Item do Estoque',
      message: `Tem certeza que deseja remover "${item.name}" do estoque? Esta ação não pode ser desfeita.`,
      onConfirm: async () => {
        try {
          await deleteInventoryItem(item.id);
          await logAudit('INVENTORY_ITEM_DELETED', { itemId: item.id, itemName: item.name });
          toast.success('Item removido do estoque.');
        } catch {
          toast.error('Erro ao remover item.');
        }
      },
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const lines = text.split('\n');
      if (lines.length < 2) { toast.error('CSV vazio ou inválido.'); return; }
      setIsImporting(true);
      let count = 0;
      try {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const vals = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((v) => v.replace(/^"|"$/g, '').trim());
          if (vals.length >= 2) {
            await supabase.from('inventory').insert({
              name: vals[0] || 'Item sem nome', category: vals[1] || 'Geral',
              stock: parseInt(vals[2]) || 0, min_stock: parseInt(vals[3]) || 5,
              price: parseFloat(vals[4]) || 0,
            });
            count++;
          }
        }
        toast.success(`${count} itens importados com sucesso!`);
      } catch {
        toast.error('Erro ao importar estoque.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    if (!inventory.length) return;
    const header = ['ID', 'Item', 'Categoria', 'Estoque', 'Estoque Mínimo', 'Preço Unitário', 'Valor Total'];
    const rows = inventory.map((i) =>
      [i.id, `"${i.name}"`, `"${i.category}"`, i.stock, i.minStock, i.price, i.stock * i.price].join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estoque_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Relatório de estoque exportado!');
  };

  return (
    <motion.div key="inventory" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estoque</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Gerencie equipamentos e insumos da rede.</p>
        </div>
        <div className="flex gap-3">
          <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              <Upload size={18} /> {isImporting ? 'Importando...' : 'Importar CSV'}
            </Button>
            <span className="text-[10px] text-zinc-400">Formato: Nome, Categoria, Qtd, Min, Preço</span>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download size={18} /> Exportar CSV
          </Button>
          <Button className="gap-2" onClick={() => setIsNewItemOpen(true)}>
            <Plus size={18} /> Novo Item
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total em Estoque', value: `${inventory.reduce((a, i) => a + i.stock, 0)} itens`, cls: '' },
          { label: 'Valor Total', value: `R$ ${totalValue.toLocaleString('pt-BR')}`, cls: 'text-primary' },
          { label: 'Itens Críticos', value: inventory.filter((i) => i.stock <= i.minStock).length, cls: 'text-red-500' },
          { label: 'Categorias', value: new Set(inventory.map((i) => i.category)).size, cls: '' },
        ].map(({ label, value, cls }) => (
          <Card key={label} className="border-none shadow-sm dark:bg-zinc-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-bold', cls)}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts + Financial */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm dark:bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Distribuição por Categoria</CardTitle>
            <CardDescription>Volume de itens em estoque por tipo de equipamento.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm dark:bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Resumo Financeiro</CardTitle>
            <CardDescription>Valor investido em ativos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {[
              { label: 'Valor em ONU', filter: (i: any) => i.category === 'ONU', color: 'bg-blue-500' },
              { label: 'Valor em Roteadores', filter: (i: any) => i.category === 'Roteador', color: 'bg-purple-500' },
              { label: 'Outros', filter: (i: any) => i.category !== 'ONU' && i.category !== 'Roteador', color: 'bg-zinc-400' },
            ].map(({ label, filter, color }) => {
              const val = inventory.filter(filter).reduce((a, i) => a + i.stock * i.price, 0);
              const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
              return (
                <div key={label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">{label}</span>
                    <span className="font-medium">R$ {val.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className={cn(color, 'h-full')} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Equipamento</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Qtd. Atual</TableHead>
                <TableHead>Mínimo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-6 font-medium">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                        <Box size={16} className="text-zinc-500" />
                      </div>
                      {item.name}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                  <TableCell className="font-mono">{item.stock} {item.unit}</TableCell>
                  <TableCell className="font-mono text-zinc-500">{item.minStock} {item.unit}</TableCell>
                  <TableCell>
                    {item.stock <= item.minStock ? (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-none">Crítico</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-none">Normal</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setSelectedItem(item);
                        setAdjustmentAmount(0);
                        setIsAdjustOpen(true);
                      }}>
                        Ajustar
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-zinc-400 hover:text-red-600"
                        onClick={() => handleDelete(item)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {inventory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-zinc-400">
                    Nenhum item no estoque. Importe um CSV ou adicione manualmente.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog — Novo Item */}
      <Dialog open={isNewItemOpen} onOpenChange={setIsNewItemOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Novo Item no Estoque</DialogTitle>
            <DialogDescription>Cadastre um novo equipamento ou insumo no sistema.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="inv-name">Nome do Equipamento</Label>
              <Input id="inv-name" placeholder="Ex: ONU Huawei HG8245H" value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="inv-cat">Categoria</Label>
                <select id="inv-cat"
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                  value={newItem.category}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
                  {['ONU', 'Roteador', 'Cabo', 'Acessório', 'Ferramenta'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-unit">Unidade</Label>
                <Input id="inv-unit" placeholder="Ex: un, km, m" value={newItem.unit}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="inv-stock">Qtd. Inicial</Label>
                <Input id="inv-stock" type="number" value={newItem.stock}
                  onChange={(e) => setNewItem({ ...newItem, stock: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-min">Qtd. Mínima</Label>
                <Input id="inv-min" type="number" value={newItem.minStock}
                  onChange={(e) => setNewItem({ ...newItem, minStock: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-price">Preço Unit.</Label>
                <Input id="inv-price" type="number" placeholder="R$" value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewItemOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddItem}>Cadastrar Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Ajuste de Estoque */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Ajustar Estoque</DialogTitle>
            <DialogDescription>Ajuste a quantidade em estoque para: {selectedItem?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <span className="text-sm text-zinc-500">Quantidade Atual:</span>
              <span className="font-mono font-bold">{selectedItem?.stock} {selectedItem?.unit}</span>
            </div>
            <div className="space-y-2">
              <Label>Quantidade a Adicionar/Remover</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => setAdjustmentAmount((p) => p - 1)}>
                  <TrendingDown size={16} />
                </Button>
                <Input type="number" className="text-center font-mono" value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(parseInt(e.target.value) || 0)} />
                <Button variant="outline" size="icon" onClick={() => setAdjustmentAmount((p) => p + 1)}>
                  <TrendingUp size={16} />
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500 text-center">Use valores negativos para remover do estoque.</p>
            </div>
            <div className="flex items-center justify-between p-3 border border-zinc-100 dark:border-zinc-800 rounded-lg">
              <span className="text-sm font-medium">Novo Total:</span>
              <span className={cn('font-mono font-bold',
                selectedItem && selectedItem.stock + adjustmentAmount <= selectedItem.minStock
                  ? 'text-red-500' : 'text-green-500')}>
                {selectedItem ? selectedItem.stock + adjustmentAmount : 0} {selectedItem?.unit}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAdjustOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdjust}>Confirmar Ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
