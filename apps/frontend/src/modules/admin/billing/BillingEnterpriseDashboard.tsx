import React, { useState, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, Users, Activity, 
  Plus, Edit2, Settings, Archive, CreditCard, Mail, X, PlusCircle, ArrowRight
} from 'lucide-react';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter 
} from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Switch } from '@/src/components/ui/switch';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '@/src/components/ui/dialog';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/src/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/src/components/ui/table';
import { toast } from 'sonner';

// --- Mocks ---
const REVENUE_DATA = [
  { day: 1, mrr: 12000, churn: 2.1, arpu: 150 },
  { day: 2, mrr: 12500, churn: 2.0, arpu: 152 },
  { day: 3, mrr: 12400, churn: 2.2, arpu: 151 },
  { day: 4, mrr: 13000, churn: 1.9, arpu: 155 },
  { day: 5, mrr: 13800, churn: 1.8, arpu: 158 },
  { day: 6, mrr: 14200, churn: 1.7, arpu: 160 },
  { day: 7, mrr: 15000, churn: 1.5, arpu: 165 },
];

const MOCK_PRODUCTS = [
  { id: 'prod_1', name: 'Starter Platform', type: 'Flat', price: '$49', billing: 'Monthly', status: 'Active' },
  { id: 'prod_2', name: 'Growth Engine', type: 'Tiered', price: 'Volume', billing: 'Monthly', status: 'Active' },
  { id: 'prod_3', name: 'Enterprise Analytics', type: 'Usage-Based', price: '$0.05/req', billing: 'Monthly', status: 'Draft' },
];

const MetricSparkline = ({ data, dataKey, color }: { data: any[], dataKey: string, color: string }) => (
  <div className="h-12 w-full mt-2">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Line 
          type="monotone" 
          dataKey={dataKey} 
          stroke={color} 
          strokeWidth={2} 
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// --- Component ---
export default function BillingEnterpriseDashboard() {
  // State for Sheet/Drawer
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('products');

  // Revenue Metrics calculations
  const metrics = useMemo(() => {
    const current = REVENUE_DATA[REVENUE_DATA.length - 1];
    const previous = REVENUE_DATA[REVENUE_DATA.length - 2];
    
    return {
      mrr: { value: current.mrr, trend: ((current.mrr - previous.mrr) / previous.mrr) * 100 },
      arr: { value: current.mrr * 12, trend: ((current.mrr - previous.mrr) / previous.mrr) * 100 },
      churn: { value: current.churn, trend: current.churn - previous.churn },
      arpu: { value: current.arpu, trend: ((current.arpu - previous.arpu) / previous.arpu) * 100 },
    };
  }, []);

  // --- Price Builder State ---
  const [pricingModel, setPricingModel] = useState('flat');
  const [tiers, setTiers] = useState([{ id: 1, upTo: '', price: '' }]);
  const [dunning, setDunning] = useState({ day3: true, day5: true, day7: false });

  const addTier = useCallback(() => {
    setTiers(prev => [...prev, { id: Date.now(), upTo: '', price: '' }]);
  }, []);

  const removeTier = useCallback((id: number) => {
    setTiers(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTier = useCallback((id: number, field: string, value: string) => {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  }, []);

  const handleSaveProduct = useCallback(async () => {
    toast.success('Product and Pricing Strategy Saved', {
      description: 'Changes have been synchronized with the billing engine.'
    });
    setIsBuilderOpen(false);
  }, []);

  return (
    <div className="flex-1 w-full p-6 md:p-8 space-y-8 bg-zinc-50 dark:bg-zinc-950 min-h-screen">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">Financial Operations</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Revenue metrics, product catalog, and dunning management.</p>
        </div>
        <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
          <DialogTrigger asChild>
            <Button className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 shadow-sm gap-2">
              <Plus className="h-4 w-4" /> Create Product
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full sm:max-w-2xl overflow-y-auto max-h-screen p-0 bg-white dark:bg-zinc-950 dark:border-zinc-800">
            
            <div className="sticky top-0 z-20 bg-white dark:bg-zinc-950 border-b dark:border-zinc-800 px-6 py-4">
              <DialogHeader>
                <DialogTitle className="text-xl">Price & Product Builder</DialogTitle>
                <DialogDescription>Configure elastic pricing, tiers, and tax behavior.</DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-8">
              
              {/* Product Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center p-0 dark:border-zinc-700">1</Badge> 
                  Product Details
                </h3>
                <div className="grid gap-4 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-2">
                    <Label htmlFor="prodName">Product Name</Label>
                    <Input id="prodName" placeholder="e.g. Enterprise Grade Storage" className="bg-white dark:bg-zinc-900 dark:border-zinc-800" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prodDesc">Description (Internal)</Label>
                    <Input id="prodDesc" placeholder="Max 250 words" className="bg-white dark:bg-zinc-900 dark:border-zinc-800" />
                  </div>
                </div>
              </div>

              {/* Pricing Engine */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center p-0 dark:border-zinc-700">2</Badge> 
                  Pricing Model
                </h3>
                <div className="grid gap-6 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800">
                  
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Billing Scheme</Label>
                      <Select value={pricingModel} onValueChange={setPricingModel}>
                        <SelectTrigger className="bg-white dark:bg-zinc-900 dark:border-zinc-800"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flat">Standard Pricing</SelectItem>
                          <SelectItem value="tiered">Graduated Tiers (Volume)</SelectItem>
                          <SelectItem value="seat">Per Seat / License</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tax Behavior</Label>
                      <Select defaultValue="exclusive">
                        <SelectTrigger className="bg-white dark:bg-zinc-900 dark:border-zinc-800"><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exclusive">Exclusive (Added at checkout)</SelectItem>
                          <SelectItem value="inclusive">Inclusive (Embedded in price)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Graduated Tiers Builder */}
                  {pricingModel === 'tiered' && (
                    <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="flex items-center justify-between">
                        <Label className="text-zinc-700 dark:text-zinc-300">Tier Configuration</Label>
                        <Button variant="ghost" size="sm" onClick={addTier} className="text-brand-600 hover:text-brand-700 h-8 gap-1">
                          <PlusCircle className="h-4 w-4" /> Add Tier
                        </Button>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase px-1">
                          <div className="col-span-5">Up to (Units)</div>
                          <div className="col-span-5">Unit Price ($)</div>
                          <div className="col-span-2 text-right">Delete</div>
                        </div>
                        {tiers.map((tier, idx) => (
                          <div key={tier.id} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-5">
                              <Input 
                                placeholder={idx === tiers.length - 1 ? '∞' : '100'} 
                                value={tier.upTo}
                                onChange={(e) => updateTier(tier.id, 'upTo', e.target.value)}
                                className="bg-white dark:bg-zinc-900 dark:border-zinc-800 h-9" 
                              />
                            </div>
                            <div className="col-span-5 relative">
                              <DollarSign className="h-4 w-4 absolute left-2.5 top-2.5 text-zinc-400" />
                              <Input 
                                placeholder="0.00" 
                                value={tier.price}
                                onChange={(e) => updateTier(tier.id, 'price', e.target.value)}
                                className="bg-white dark:bg-zinc-900 dark:border-zinc-800 h-9 pl-8" 
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <Button 
                                variant="ghost" size="icon" 
                                onClick={() => removeTier(tier.id)}
                                disabled={tiers.length === 1}
                                className="h-8 w-8 text-zinc-400 hover:text-red-500"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

               {/* Advanced Modules Matrix Matrix */}
              <div className="space-y-4">
                 <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 rounded-full flex items-center justify-center p-0 dark:border-zinc-700">3</Badge> 
                  Feature Gates Matrix
                </h3>
                <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800 flex flex-col items-center justify-center text-center py-8">
                   <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center mb-3">
                     <Settings className="h-5 w-5 text-zinc-500" />
                   </div>
                   <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Visual Feature Matrix</p>
                   <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">Define which system resources this product unlocks for the Tenant.</p>
                   <Button variant="outline" className="mt-4 bg-white dark:bg-zinc-900 dark:border-zinc-800 text-xs h-8">Map Resources</Button>
                </div>
              </div>

            </div>
            
            <div className="sticky bottom-0 z-20 bg-white dark:bg-zinc-950 border-t dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setIsBuilderOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveProduct} className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-950 dark:hover:bg-zinc-200 text-white dark:text-zinc-950">Save Product</Button>
            </div>
            
          </DialogContent>
        </Dialog>
      </div>

      {/* Top level Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <Card className="border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Monthly Recurring (MRR)</p>
                <div className="flex items-end gap-2 mt-1">
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">${metrics.mrr.value.toLocaleString()}</h3>
                  <Badge variant={metrics.mrr.trend >= 0 ? "default" : "destructive"} className={metrics.mrr.trend >= 0 ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}>
                    {metrics.mrr.trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1"/> : <TrendingDown className="w-3 h-3 mr-1"/>}
                    {Math.abs(metrics.mrr.trend).toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <MetricSparkline data={REVENUE_DATA} dataKey="mrr" color="#10b981" />
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Annual Run Rate (ARR)</p>
                <div className="flex items-end gap-2 mt-1">
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">${metrics.arr.value.toLocaleString()}</h3>
                </div>
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="mt-4"><div className="h-12 w-full bg-blue-50/50 dark:bg-blue-500/5 rounded flex items-center justify-center text-xs text-blue-400">Projection derived from MRR</div></div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Net Churn Rate</p>
                <div className="flex items-end gap-2 mt-1">
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{metrics.churn.value}%</h3>
                  <Badge variant={metrics.churn.trend <= 0 ? "default" : "destructive"} className={metrics.churn.trend <= 0 ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}>
                    {metrics.churn.trend <= 0 ? <TrendingDown className="w-3 h-3 mr-1"/> : <TrendingUp className="w-3 h-3 mr-1"/>}
                    {Math.abs(metrics.churn.trend).toFixed(2)}
                  </Badge>
                </div>
              </div>
              <div className="p-2 bg-red-50 dark:bg-red-500/10 rounded-lg">
                <Users className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <MetricSparkline data={REVENUE_DATA} dataKey="churn" color="#ef4444" />
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <CardContent className="pt-6">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Average Revenue (ARPU)</p>
                <div className="flex items-end gap-2 mt-1">
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">${metrics.arpu.value}</h3>
                  <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 border-none">
                    +${Math.abs((metrics.arpu.value - REVENUE_DATA[REVENUE_DATA.length-2].arpu)).toFixed(0)}
                  </Badge>
                </div>
              </div>
               <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
                <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
            <MetricSparkline data={REVENUE_DATA} dataKey="arpu" color="#6366f1" />
          </CardContent>
        </Card>

      </div>

      {/* Main Tabs Segment */}
      <Card className="border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm col-span-1">
        <Tabs defaultValue="products" className="w-full">
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-t-xl">
             <TabsList className="bg-transparent space-x-2 h-auto p-0">
              <TabsTrigger 
                value="products" 
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-50 text-zinc-500 dark:text-zinc-400 rounded-full px-4 py-1.5"
              >
                Products & Prices
              </TabsTrigger>
              <TabsTrigger 
                value="dunning" 
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-50 text-zinc-500 dark:text-zinc-400 rounded-full px-4 py-1.5"
              >
                Dunning & Retries
              </TabsTrigger>
              <TabsTrigger 
                value="invoices" 
                className="data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-50 text-zinc-500 dark:text-zinc-400 rounded-full px-4 py-1.5"
              >
                Invoices
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="products" className="p-0 m-0">
             <Table>
                <TableHeader className="bg-zinc-50/50 dark:bg-zinc-900/50">
                  <TableRow className="dark:border-zinc-800">
                    <TableHead className="pl-6 font-semibold">Product Name</TableHead>
                    <TableHead className="font-semibold">Pricing Model</TableHead>
                    <TableHead className="font-semibold">Base Price</TableHead>
                    <TableHead className="font-semibold">Billing Cycle</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="pr-6 text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MOCK_PRODUCTS.map((prod) => (
                    <TableRow key={prod.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:border-zinc-800">
                      <TableCell className="pl-6 font-medium text-zinc-900 dark:text-zinc-50">{prod.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 dark:border-zinc-700 font-normal">{prod.type}</Badge>
                      </TableCell>
                      <TableCell className="text-zinc-600 dark:text-zinc-300 font-mono text-sm">{prod.price}</TableCell>
                      <TableCell className="text-zinc-500 dark:text-zinc-400 text-sm">{prod.billing}</TableCell>
                      <TableCell>
                         <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${prod.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span className="text-sm text-zinc-600 dark:text-zinc-300">{prod.status}</span>
                         </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-600">
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Pagination Mock */}
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                 <span>Showing 1 to 3 of 3 items</span>
                 <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled>Previous</Button>
                    <Button variant="outline" size="sm" disabled>Next</Button>
                 </div>
              </div>
          </TabsContent>

          <TabsContent value="dunning" className="p-6 m-0 bg-white dark:bg-zinc-950 rounded-b-xl border-t dark:border-zinc-800">
             <div className="max-w-3xl space-y-8">
               
               <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Smart Retries Schedule</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Configure automated actions when a recurring payment fails.</p>
               </div>

               <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 dark:before:via-zinc-800 before:to-transparent">
                  
                  {/* Step 1 */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                     <div className="flex items-center justify-center w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                       <Mail className="h-4 w-4" />
                     </div>
                     <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-start gap-4">
                        <Switch id="d3" checked={dunning.day3} onCheckedChange={(c) => setDunning(p => ({...p, day3: c}))} className="mt-1" />
                        <div>
                          <Label htmlFor="d3" className="font-semibold text-zinc-900 dark:text-zinc-50 cursor-pointer">Day 3: Payment reminder</Label>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Send an automated email to the customer with an invoice link.</p>
                        </div>
                     </div>
                  </div>

                  {/* Step 2 */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                     <div className="flex items-center justify-center w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                       <CreditCard className="h-4 w-4" />
                     </div>
                     <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-start gap-4">
                        <Switch id="d5" checked={dunning.day5} onCheckedChange={(c) => setDunning(p => ({...p, day5: c}))} className="mt-1" />
                        <div>
                          <Label htmlFor="d5" className="font-semibold text-zinc-900 dark:text-zinc-50 cursor-pointer">Day 5: Retry charge</Label>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Attempt to charge the default payment method again.</p>
                        </div>
                     </div>
                  </div>

                  {/* Step 3 */}
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                     <div className="flex items-center justify-center w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-red-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                       <X className="h-4 w-4" />
                     </div>
                     <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-red-100 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10 shadow-sm flex items-start gap-4">
                        <Switch id="d7" checked={dunning.day7} onCheckedChange={(c) => setDunning(p => ({...p, day7: c}))} className="mt-1 data-[state=checked]:bg-red-600" />
                        <div>
                          <Label htmlFor="d7" className="font-semibold text-zinc-900 dark:text-zinc-50 cursor-pointer">Day 7: Mark Past Due</Label>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Change subscription status to past_due, restricting application access.</p>
                        </div>
                     </div>
                  </div>
               </div>

             </div>
          </TabsContent>

          <TabsContent value="invoices" className="p-12 m-0 bg-white dark:bg-zinc-950 rounded-b-xl border-t dark:border-zinc-800 text-center flex flex-col items-center justify-center">
             <div className="h-16 w-16 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-zinc-400 dark:text-zinc-600" />
             </div>
             <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Invoices & Receipts</h3>
             <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 max-w-sm">A centralized view of all generated invoices will appear here in the next module installation.</p>
          </TabsContent>

        </Tabs>
      </Card>

    </div>
  );
}
