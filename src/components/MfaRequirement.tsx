import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { multiFactor, TotpMultiFactorGenerator, TotpSecret } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { toast } from 'sonner';

export function MfaRequirement({ onEnrolled }: { onEnrolled: () => void }) {
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpUrl, setTotpUrl] = useState<string | null>(null);
  const [totpPin, setTotpPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        startEnrollment(user);
      }
    });
    return () => unsubscribe();
  }, []);

  const startEnrollment = async (user: any) => {
    try {
      setErrorMsg(null);
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const url = secret.generateQrCodeUrl(user.email || 'user', 'Astrum AI');
      setTotpSecret(secret);
      setTotpUrl(url);
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/operation-not-allowed') {
        toast.error('O Firebase Identity Platform com suporte a TOTP não está ativado neste projeto.');
        onEnrolled();
        return;
      }
      setErrorMsg(e.message || 'Erro ao iniciar MFA. Verifique se o recurso está ativado (Identity Platform).');
      toast.error('Erro ao iniciar MFA: ' + e.message);
    }
  };

  const confirmEnrollment = async () => {
    if (!totpSecret || !totpPin) return;
    setIsLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, totpPin);
      await multiFactor(currentUser).enroll(assertion, 'App Auth');
      toast.success('MFA ativado!');
      onEnrolled();
    } catch (e: any) {
      toast.error('Código inválido: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Segurança Obrigatória</CardTitle>
          <CardDescription>
            Seu nível de acesso exige a configuração de Autenticação em Duas Etapas (2FA).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex flex-col items-center">
          {errorMsg ? (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="text-red-500 font-medium">Não foi possível carregar o MFA</div>
              <div className="text-sm text-zinc-500">{errorMsg}</div>
              <p className="text-xs text-zinc-400 mt-2">
                O Firebase Identity Platform com suporte a TOTP pode não estar ativado neste projeto.
              </p>
              <Button onClick={onEnrolled} variant="outline" className="mt-4">
                Ignorar por agora (Modo Dev)
              </Button>
            </div>
          ) : totpUrl ? (
            <>
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG value={totpUrl} size={200} />
              </div>
              <p className="text-sm text-center text-zinc-500">
                Escaneie o código com o Google Authenticator ou aplicativo similar e digite o código de 6 dígitos gerado.
              </p>
              <div className="w-full space-y-2 mt-4">
                <Label>Código de 6 dígitos</Label>
                <div className="flex gap-2">
                  <Input 
                    value={totpPin}
                    onChange={(e) => setTotpPin(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                  />
                  <Button onClick={confirmEnrollment} disabled={totpPin.length < 6 || isLoading}>
                    {isLoading ? 'Verificando...' : 'Confirmar'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
             <div className="py-10">Carregando gerador MFA...</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
