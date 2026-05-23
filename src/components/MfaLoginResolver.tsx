import React, { useState } from 'react';
import { MultiFactorResolver, TotpMultiFactorGenerator } from 'firebase/auth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { toast } from 'sonner';

export function MfaLoginResolver({ 
  resolver, 
  onResolved, 
  onCancel 
}: { 
  resolver: MultiFactorResolver, 
  onResolved: () => void, 
  onCancel: () => void 
}) {
  const [totpPin, setTotpPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const confirmLogin = async () => {
    if (!totpPin) return;
    setIsLoading(true);
    try {
      const hints = resolver.hints;
      const totpHint = hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
      
      if (!totpHint) {
         throw new Error('Nenhum fator TOTP encontrado.');
      }
      
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, totpPin);
      await resolver.resolveSignIn(assertion);
      
      onResolved();
    } catch (e: any) {
      toast.error('Código MFA inválido.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-sm w-full">
        <CardHeader>
          <CardTitle>Verificação em Duas Etapas</CardTitle>
          <CardDescription>
            Insira o código gerado pelo seu aplicativo autenticador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Código MFA</Label>
            <Input 
              value={totpPin}
              onChange={(e) => setTotpPin(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="text-center text-lg tracking-widest"
              autoFocus
            />
          </div>
          <div className="flex gap-2 w-full pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isLoading}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={confirmLogin} disabled={totpPin.length < 6 || isLoading}>
              {isLoading ? 'Verificando...' : 'Entrar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
