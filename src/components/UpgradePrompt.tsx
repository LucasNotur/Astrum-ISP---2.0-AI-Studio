import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Check, X, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PLAN_COMPARISON = [
  { feature: 'Operadores', free: '1', pro: '5', business: '20', enterprise: 'Ilimitado' },
  { feature: 'Mensagens / Mês', free: '500', pro: '10.000', business: '50.000', enterprise: 'Ilimitado' },
  { feature: 'Base de Conhecimento (IA)', free: true, pro: true, business: true, enterprise: true },
  { feature: 'WhatsApp API', free: false, pro: true, business: true, enterprise: true },
  { feature: 'Whitelabel Básico', free: false, pro: false, business: true, enterprise: true },
  { feature: 'Whitelabel Avançado', free: false, pro: false, business: false, enterprise: true },
  { feature: 'Domínio Customizado', free: false, pro: false, business: false, enterprise: true },
  { feature: 'Suporte Prioritário', free: false, pro: false, business: true, enterprise: true },
];

export function UpgradePrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [blockedFeature, setBlockedFeature] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleFeatureBlocked = (event: CustomEvent) => {
      if (event.detail?.feature) {
        setBlockedFeature(event.detail.feature);
      } else {
        setBlockedFeature('recurso premium');
      }
      setIsOpen(true);
    };

    window.addEventListener('FEATURE_NOT_AVAILABLE', handleFeatureBlocked as EventListener);

    return () => {
      window.removeEventListener('FEATURE_NOT_AVAILABLE', handleFeatureBlocked as EventListener);
    };
  }, []);

  const handleUpgrade = () => {
    setIsOpen(false);
    navigate('/billing');
  };

  const renderBoolean = (val: boolean | string) => {
    if (typeof val === 'string') return val;
    return val ? <Check size={16} className="text-green-500 mx-auto" /> : <X size={16} className="text-zinc-300 mx-auto dark:text-zinc-700" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="text-blue-500" /> 
            Upgrade Necessário
          </DialogTitle>
          <DialogDescription>
            O acesso a <strong className="text-zinc-900 dark:text-zinc-100">{blockedFeature}</strong> não está disponível no seu plano atual. 
            Faça um upgrade para liberar este e outros recursos exclusivos.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recurso</TableHead>
                <TableHead className="text-center">Free</TableHead>
                <TableHead className="text-center text-blue-600 font-bold bg-blue-50/50 dark:bg-blue-900/10">Pro</TableHead>
                <TableHead className="text-center text-purple-600 font-bold">Business</TableHead>
                <TableHead className="text-center">Enterprise</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PLAN_COMPARISON.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-xs">{row.feature}</TableCell>
                  <TableCell className="text-center text-xs">{renderBoolean(row.free)}</TableCell>
                  <TableCell className="text-center text-xs bg-blue-50/50 dark:bg-blue-900/10">{renderBoolean(row.pro)}</TableCell>
                  <TableCell className="text-center text-xs">{renderBoolean(row.business)}</TableCell>
                  <TableCell className="text-center text-xs">{renderBoolean(row.enterprise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Mais tarde</Button>
          <Button onClick={handleUpgrade} className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
            Fazer Upgrade Agora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
