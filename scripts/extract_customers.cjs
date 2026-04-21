const fs = require('fs');

const appPath = 'src/App.tsx';
const compPath = 'src/pages/CustomersPage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

// The JSX for Customers page
const startIdx = content.indexOf("{activeTab === 'customers' && (");
const endIdx = content.indexOf("{activeTab === 'tickets' && (");
const custJSX = content.slice(startIdx, endIdx)
   .replace("{activeTab === 'customers' && (", "")
   .trim().replace(/}\)$/, "");

// Dialogs
const diagEditStart = content.indexOf("<Dialog open={isEditDialogOpen}");
const diagEditEnd = content.indexOf("</Dialog>", diagEditStart) + 9;
const diagEditJSX = content.slice(diagEditStart, diagEditEnd);

const diagCreateStart = content.indexOf("<Dialog open={isCreateDialogOpen}");
const diagCreateEnd = content.indexOf("</Dialog>", diagCreateStart) + 9;
const diagCreateJSX = content.slice(diagCreateStart, diagCreateEnd);

// States and logic to copy/move
// We'll just define the component using string templates to be clean.

const newComponent = `
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Card, CardContent } from "@/src/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { 
  Users, Plus, Search, Filter, MoreVertical, Edit2, ShieldAlert, Zap, X, MapPin, Phone, Mail, Building 
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import { toast } from "sonner";
import { createCustomer, updateCustomer as updateCustomerDb, deleteCustomer as deleteCustomerDb, getCustomers } from '@/src/lib/db';

export function CustomersPage() {
  const { customers, setCustomers, currentUserRole, setSelectedCustomerDetails, setConfirmDialog } = useAppStore();
  const isOwner = currentUserRole === 'owner' || currentUserRole === 'admin';

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all');
  const [customerPlanFilter, setCustomerPlanFilter] = useState('all');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [newCustomer, setNewCustomer] = useState<any>({ name: '', email: '', phone: '', address: '', plan: '', mrr: 0, status: 'active', tags: [] });
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);
  
  const [newTagInput, setNewTagInput] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = customerSearch.toLowerCase();
      const matchesSearch = 
        c.name?.toLowerCase().includes(q) || 
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q) ||
        c.tags?.some((t: string) => t.toLowerCase().includes(q));
      
      const matchesStatus = customerStatusFilter === 'all' || c.status === customerStatusFilter;
      
      const matchesPlan = customerPlanFilter === 'all' || 
        (customerPlanFilter === 'Premium' && c.plan === 'Premium') ||
        (customerPlanFilter === 'Fibra' && c.plan?.includes('Fibra')) ||
        (customerPlanFilter === 'Radio' && c.plan?.includes('Rádio'));
        
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [customers, customerSearch, customerStatusFilter, customerPlanFilter]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!newCustomer.name) errors.name = 'Nome é obrigatório';
    if (!newCustomer.email) errors.email = 'Email é obrigatório';
    if (!newCustomer.plan) errors.plan = 'Plano é obrigatório';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    try {
      const id = await createCustomer(newCustomer);
      toast.success('Cliente criado com sucesso!');
      setIsCreateDialogOpen(false);
      setNewCustomer({ name: '', email: '', phone: '', address: '', plan: '', mrr: 0, status: 'active', tags: [] });
      setFormErrors({});
      // Refresh
      const updated = await getCustomers();
      setCustomers(updated);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar cliente.');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsUpdatingCustomer(true);
    try {
      await updateCustomerDb(editingCustomer.id, editingCustomer);
      toast.success('Cliente atualizado com sucesso!');
      setIsEditDialogOpen(false);
      const updated = await getCustomers();
      setCustomers(updated);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar cliente.');
    } finally {
      setIsUpdatingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Excluir Cliente",
      message: "Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita e removerá os acessos do cliente.",
      onConfirm: async () => {
        try {
          await deleteCustomerDb(id);
          toast.success("Cliente removido com sucesso");
          const updated = await getCustomers();
          setCustomers(updated);
        } catch (error) {
          console.error(error);
          toast.error("Erro ao remover cliente");
        }
      }
    });
  };

  return (
    <>
      ${custJSX.replace(/setIsDetailsDialogOpen\(true\)/g, "/* Removed details dialog for now */").replace(/<IsDetailsDialogOpen>/g, "")}
      ${diagEditJSX}
      ${diagCreateJSX}
    </>
  );
}
`;

if (!fs.existsSync('src/pages')) fs.mkdirSync('src/pages', { recursive: true });
fs.writeFileSync(compPath, newComponent, 'utf8');

// Now purge from App.tsx
// 1. Delete JSX block
content = content.slice(0, startIdx) + 
   `{activeTab === 'customers' && <CustomersPage />}\n        ` + 
   content.slice(endIdx);

// 2. Add import
if (!content.includes("import { CustomersPage }")) {
   content = content.replace("import { DashboardPage }", "import { DashboardPage }\nimport { CustomersPage } from './pages/CustomersPage';");
}

// 3. Remove local state usages related to customers
const varsToRemove = [
  "const [customerSearch, setCustomerSearch] = useState('');\n",
  "const [customerStatusFilter, setCustomerStatusFilter] = useState('all');\n",
  "const [customerPlanFilter, setCustomerPlanFilter] = useState('all');\n",
  "const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);\n",
  "const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);\n",
  "const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);\n",
  "const [newCustomer, setNewCustomer] = useState<any>({ name: '', email: '', phone: '', address: '', plan: '', mrr: 0, status: 'active', tags: [] });\n",
  "const [editingCustomer, setEditingCustomer] = useState<any>(null);\n",
  "const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);\n",
  "const [newTagInput, setNewTagInput] = useState('');\n",
  "const [formErrors, setFormErrors] = useState<Record<string, string>>({});\n"
];

for (const v of varsToRemove) {
    // Regex just in case spaces vary
    const regex = new RegExp(v.replace(/[.*+?^$\{() |[\\]\\\\]/g, '\\\\$&').replace(/\\s+/g, '\\\\s*'));
    content = content.replace(regex, "");
}

// 4. Remove Dialogs and functions
let purge = (startToken, endToken) => {
    const s = content.indexOf(startToken);
    if(s !== -1) {
        const e = content.indexOf(endToken, s);
        if (e !== -1) content = content.slice(0, s) + content.slice(e + endToken.length);
    }
}

purge("<Dialog open={isEditDialogOpen}", "</Dialog>");
purge("<Dialog open={isCreateDialogOpen}", "</Dialog>");

const hcStart = content.indexOf("const handleCreateCustomer =");
if (hcStart !== -1) {
    const hcEnd = content.indexOf("};", hcStart) + 2;
    content = content.slice(0, hcStart) + content.slice(hcEnd);
}

const huStart = content.indexOf("const handleUpdateCustomer =");
if (huStart !== -1) {
    const huEnd = content.indexOf("};", huStart) + 2;
    content = content.slice(0, huStart) + content.slice(huEnd);
}

// Delete filteredCustomers useMemo
const fcStart = content.indexOf("const filteredCustomers = useMemo(");
if (fcStart !== -1) {
    const fcEnd = content.indexOf("}, [customers, customerSearch, customerStatusFilter, customerPlanFilter]);");
    if(fcEnd !== -1) {
        content = content.slice(0, fcStart) + content.slice(fcEnd + 74);
    }
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('CustomersPage extracted!');
