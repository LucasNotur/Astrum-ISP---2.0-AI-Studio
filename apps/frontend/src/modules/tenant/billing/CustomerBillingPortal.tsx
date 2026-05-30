import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid
} from 'recharts';
import { 
  CreditCard, Plus, Download, MoreHorizontal, Clock, CheckCircle2, 
  AlertCircle, Users, Activity, Sparkles, Building, Mail, Trash2
} from 'lucide-react';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter 
} from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/src/components/ui/table';
import { toast } from 'sonner';

// --- Mocks ---
const MOCK_TOKEN_USAGE = [
  { date: 'Oct 1', tokens: 12000 },
  { date: 'Oct 2', tokens: 15000 },
  { date: 'Oct 3', tokens: 13500 },
  { date: 'Oct 4', tokens: 22000 },
  { date: 'Oct 5', tokens: 18000 },
  { date: 'Oct 6', tokens: 28000 },
  { date: 'Oct 7', tokens: 25000 },
  { date: 'Oct 8', tokens: 32000 },
  { date: 'Oct 9', tokens: 35000 },
  { date: 'Oct 10', tokens: 42000 },
];

const MOCK_INVOICES = [
  { id: 'INV-2023-10', date: 'Oct 01, 2023', amount: '$499.00', status: 'Paid' },
  { id: 'INV-2023-09', date: 'Sep 01, 2023', amount: '$499.00', status: 'Paid' },
  { id: 'INV-2023-08', date: 'Aug 01, 2023', amount: '$434.50', status: 'Paid' },
  { id: 'INV-2023-07', date: 'Jul 01, 2023', amount: '$299.00', status: 'Void' },
];

const INITIAL_TEAM = [
  { id: 1, email: 'admin@provider.com', role: 'Owner', tokens: 145000 },
  { id: 2, email: 'tech@provider.com', role: 'Member', tokens: 85000 },
  { id: 3, email: 'support@provider.com', role: 'Member', tokens: 22000 },
];

// --- Subcomponents ---

const SkeletonLoader = () => (
  <div className="w-full space-y-8 animate-pulse p-6 md:p-8">
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <div className="h-6 w-48 bg-gray-200 rounded"></div>
        <div className="h-4 w-64 bg-gray-200 rounded"></div>
      </div>
      <div className="h-10 w-32 bg-gray-200 rounded"></div>
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
         <div className="h-64 bg-gray-200 rounded-xl"></div>
         <div className="h-80 bg-gray-200 rounded-xl"></div>
      </div>
       <div className="space-y-6">
         <div className="h-48 bg-gray-200 rounded-xl"></div>
         <div className="h-96 bg-gray-200 rounded-xl"></div>
       </div>
    </div>
  </div>
);

// --- Component ---
export default function CustomerBillingPortal() {
  const [loading, setLoading] = useState(true);
  
  // Optimistic UI State
  const [teamMembers, setTeamMembers] = useState(INITIAL_TEAM);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    // Simulate network load
    const timer = setTimeout(() => {
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    // Optimistic Update
    const newUser = {
      id: Date.now(),
      email: inviteEmail,
      role: 'Member',
      tokens: 0
    };
    
    setTeamMembers(prev => [...prev, newUser]);
    setInviteEmail('');
    setIsInviting(true);

    toast.promise(
      new Promise(resolve => setTimeout(resolve, 1000)), // Simulate API call
      {
        loading: 'Adding seat to subscription...',
        success: () => {
          setIsInviting(false);
          return 'User invited successfully. Seat added to subscription.';
        },
        error: () => {
          // Revert optimistic update on failure
          setTeamMembers(prev => prev.filter(u => u.id !== newUser.id));
          setIsInviting(false);
          return 'Failed to add user. Please try again.';
        }
      }
    );
  };

  const handleRemoveUser = (id: number) => {
    // Optimistic Update
    const removedUser = teamMembers.find(u => u.id === id);
    if (!removedUser) return;
    
    setTeamMembers(prev => prev.filter(u => u.id !== id));

    toast.promise(
      new Promise(resolve => setTimeout(resolve, 800)),
      {
        loading: 'Removing seat...',
        success: 'Seat removed. This will be reflected in your next invoice.',
        error: () => {
           setTeamMembers(prev => [...prev, removedUser]);
           return 'Failed to remove user.';
        }
      }
    );
  };

  if (loading) {
    return <SkeletonLoader />;
  }

  return (
    <div className="flex-1 w-full p-6 md:p-8 space-y-8 bg-zinc-950 min-h-screen">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50 tracking-tight">Billing & Usage</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage your plan, team seats, and monitor resource consumption.</p>
        </div>
        <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2 text-sm font-medium">
          <Building className="h-4 w-4 text-zinc-500" /> Company Settings
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column - Wider */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tokens Usage Overview */}
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm overflow-hidden">
            <CardHeader className="bg-zinc-900 pb-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-medium flex items-center gap-2 text-zinc-50">
                    <Sparkles className="h-4 w-4 text-violet-500" /> AI Requests (Tokens)
                  </CardTitle>
                  <CardDescription className="text-zinc-400">Daily consumption across your organization</CardDescription>
                </div>
                <div className="text-right">
                   <div className="text-2xl font-bold text-zinc-50">252,000</div>
                   <div className="text-xs text-zinc-500">/ 500,000 Included</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-6">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={MOCK_TOKEN_USAGE} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#71717a', fontSize: 12 }}
                      dx={-10}
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #27272a', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#fafafa' }}
                      cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="tokens" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorTokens)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Seat Management & Drill-Down */}
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm">
             <CardHeader className="border-b border-zinc-800 bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-medium flex items-center gap-2 text-zinc-50">
                       <Users className="h-4 w-4 text-zinc-500" /> Team Seats & Top Consumers
                    </CardTitle>
                    <CardDescription className="text-zinc-400">Manage active members and view granular usage.</CardDescription>
                  </div>
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 font-normal">
                    {teamMembers.length} Active Seats
                  </Badge>
                </div>
             </CardHeader>
             
             <CardContent className="p-0">
               {/* Invite Bar */}
               <div className="p-4 bg-zinc-950/50 border-b border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                 <form onSubmit={handleInviteUser} className="flex flex-1 items-center gap-2 w-full">
                    <div className="relative flex-1 max-w-sm">
                      <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                      <Input 
                        type="email" 
                        placeholder="Invite member by email" 
                        className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-50" 
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" disabled={isInviting || !inviteEmail} className="bg-violet-600 text-white hover:bg-violet-700">
                       Invite
                    </Button>
                 </form>
                 
                 <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 px-3 py-2 rounded-md border border-amber-500/20">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Adding a new seat will add a $15 pro-rata charge to your next invoice.</span>
                 </div>
               </div>

               {/* Members Table */}
               <Table>
                 <TableHeader>
                   <TableRow className="hover:bg-zinc-800/50 border-zinc-800">
                     <TableHead className="pl-6 text-zinc-400">User</TableHead>
                     <TableHead className="text-zinc-400">Role</TableHead>
                     <TableHead className="text-right text-zinc-400">Tokens Consumed</TableHead>
                     <TableHead className="w-[80px]"></TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {teamMembers.sort((a,b) => b.tokens - a.tokens).map(member => (
                     <TableRow key={member.id} className="border-zinc-800 hover:bg-zinc-800/50">
                       <TableCell className="pl-6 font-medium text-zinc-50">{member.email}</TableCell>
                       <TableCell>
                         <Badge variant="outline" className="font-normal text-zinc-300 border-zinc-700">
                           {member.role}
                         </Badge>
                       </TableCell>
                       <TableCell className="text-right font-mono text-sm text-zinc-400">
                         {member.tokens.toLocaleString()}
                       </TableCell>
                       <TableCell className="text-right pr-6">
                          {member.role !== 'Owner' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleRemoveUser(member.id)}
                              className="text-zinc-500 hover:text-red-400 h-8 w-8 hover:bg-zinc-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </CardContent>
          </Card>

        </div>

        {/* Right Column - Narrower */}
        <div className="space-y-6">
          
          {/* Current Plan Overview */}
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm overflow-hidden relative">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 to-violet-400" />
             <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Current Plan</CardTitle>
                <div className="mt-2 flex items-baseline gap-2">
                   <h2 className="text-3xl font-bold text-zinc-50">Growth</h2>
                   <span className="text-zinc-500 font-medium">/ month</span>
                </div>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-4 bg-zinc-950 rounded-lg space-y-3">
                   <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Base Plan</span>
                      <span className="font-medium text-zinc-50">$299.00</span>
                   </div>
                   <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">{teamMembers.length} Extra Seats</span>
                      <span className="font-medium text-zinc-50">${(teamMembers.length * 15).toFixed(2)}</span>
                   </div>
                   <div className="pt-3 border-t border-zinc-800 flex justify-between">
                      <span className="font-semibold text-zinc-50">Next Invoice</span>
                      <span className="font-bold text-zinc-50">${(299 + teamMembers.length * 15).toFixed(2)}</span>
                   </div>
                </div>

                <div className="text-xs text-zinc-500 flex items-center gap-1">
                   <Clock className="h-3 w-3" /> Renews automatically on Nov 01, 2023
                </div>
             </CardContent>
             <CardFooter className="pt-2 border-t border-zinc-800 bg-zinc-900">
                <Button variant="outline" className="w-full bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  Update Plan
                </Button>
             </CardFooter>
          </Card>

          {/* Payment Methods */}
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm">
             <CardHeader className="pb-4 border-b border-zinc-800">
                <CardTitle className="text-base font-medium flex items-center gap-2 text-zinc-50">
                   <CreditCard className="h-4 w-4 text-zinc-500" /> Payment Methods
                </CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                <div className="p-4 flex items-center justify-between border-b border-zinc-800">
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-12 bg-zinc-800 rounded flex items-center justify-center text-[10px] text-white font-bold tracking-wider">
                        VISA
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-50">•••• 4242</p>
                        <p className="text-xs text-zinc-500">Expires 12/2025</p>
                      </div>
                   </div>
                   <Badge className="bg-emerald-500/10 text-emerald-400 border-none hover:bg-emerald-500/20">Default</Badge>
                </div>
                <div className="p-4">
                  <Button variant="ghost" className="w-full text-sm text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 gap-2 h-9">
                    <Plus className="h-4 w-4" /> Add Payment Method
                  </Button>
                </div>
             </CardContent>
          </Card>

          {/* Invoice History */}
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm">
             <CardHeader className="pb-4 border-b border-zinc-800">
                <CardTitle className="text-base font-medium flex items-center gap-2 text-zinc-50">
                   <Activity className="h-4 w-4 text-zinc-500" /> Billing History
                </CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                <div className="divide-y divide-zinc-800">
                  {MOCK_INVOICES.map(inv => (
                    <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-zinc-50">{inv.amount}</p>
                          {inv.status === 'Paid' ? (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Paid</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-zinc-800 text-zinc-400 border-zinc-700">Void</Badge>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500">{inv.date} &middot; {inv.id}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-violet-400 hover:bg-zinc-800">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
             </CardContent>
             <CardFooter className="p-2 border-t border-zinc-800 bg-zinc-950/50 justify-center">
                <Button variant="link" className="text-xs text-zinc-400 hover:text-zinc-50 h-auto p-0">
                  View all history &rarr;
                </Button>
             </CardFooter>
          </Card>

        </div>

      </div>
    </div>
  );
}
