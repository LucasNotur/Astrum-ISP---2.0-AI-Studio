import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, CheckCircle2, QrCode, PenTool, Navigation, ArrowLeft,
  Upload, AlertTriangle, CircleCheck, ScanSearch, Phone, MapPin,
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { toast } from 'sonner';
import { useTechAppStore } from '../../store/techAppStore';
import { StatusTimeline } from './StatusTimeline';
import { ClientDossier } from './ClientDossier';
import { SignaturePad } from '../SignaturePad';
import { uploadTenantFile } from '../../lib/storage';
import { processSignatureAndPdf } from '../../lib/signaturePad';
import { fetchOsrmRoute } from '../../lib/osrm';
import {
  startServiceOrder, completeServiceOrder, fetchChecklist, markChecklistItem,
  registerMedia, validatePhoto, generateSummary, fetchDossie,
} from '../../lib/fieldOps';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

const isRealOsId = (id: string) => typeof id === 'string' && !id.startsWith('OS-');

export function ActiveOsView() {
  const activeOs = useTechAppStore((s) => s.activeOs);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const setView = useTechAppStore((s) => s.setView);
  const gps = useTechAppStore((s) => s.gps);
  const startNavigation = useTechAppStore((s) => s.startNavigation);
  const osList = useTechAppStore((s) => s.osList);
  const setOsList = useTechAppStore((s) => s.setOsList);

  const [checklist, setChecklist] = useState<any[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [materials, setMaterials] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'checkin' | 'checkout' | 'equipment' | null>(null);
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Load checklist when OS changes
  useEffect(() => {
    if (!activeOs) return;
    setChecklist(activeOs.checklist || []);
    if (isRealOsId(activeOs.id) && navigator.onLine) {
      fetchChecklist(activeOs.id)
        .then((items) => { if (items.length > 0) setChecklist(items); })
        .catch(() => {});
    }
  }, [activeOs?.id]);

  // QR Scanner
  useEffect(() => {
    if (!showScanner) return;
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    scanner.render(
      (text) => {
        if (!materials.includes(text)) {
          setMaterials((prev) => [...prev, text]);
          toast.success(`Material: ${text}`);
        }
        scanner.clear();
        setShowScanner(false);
      },
      () => {},
    );
    return () => { scanner.clear().catch(() => {}); };
  }, [showScanner]);

  if (!activeOs) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <ClipboardEmpty />
        <p className="text-zinc-400 text-sm mt-4">Nenhuma OS selecionada</p>
        <Button variant="outline" className="mt-3" onClick={() => setView('agenda')}>
          Ver agenda
        </Button>
      </div>
    );
  }

  const allChecklistDone = checklist.length === 0 || checklist.every((i) => i.done);

  const stopCamera = () => {
    mediaStream?.getTracks().forEach((t) => t.stop());
    setMediaStream(null);
    setShowCamera(false);
  };

  const openCamera = async (mode: 'checkin' | 'checkout' | 'equipment') => {
    setCameraMode(mode);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode === 'equipment' ? 'environment' : 'user' } });
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast.error('Erro ao acessar a câmera.');
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    stopCamera();
    return dataUrl;
  };

  const handleCheckin = async () => {
    openCamera('checkin');
  };

  const handleCaptureAndCheckin = async () => {
    const img = capturePhoto();
    if (!img) return;
    setProcessing(true);
    const tid = toast.loading('Processando check-in...');

    try {
      let pos: GeolocationPosition | null = null;
      try {
        pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
      } catch {}

      let uploadedUrl = img;
      if (navigator.onLine) {
        try {
          const blob = await (await fetch(img)).blob();
          uploadedUrl = await uploadTenantFile('default', 'checkins', `${activeOs.id}_${Date.now()}.jpg`, blob);
          if (isRealOsId(activeOs.id)) {
            registerMedia(activeOs.id, { kind: 'antes', url: uploadedUrl, lat: pos?.coords.latitude, lng: pos?.coords.longitude }).catch(() => {});
          }
        } catch {}
      }

      if (navigator.onLine && isRealOsId(activeOs.id)) {
        const r = await startServiceOrder(activeOs.id, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined);
        if (!r.ok) { toast.error('Erro ao iniciar OS: ' + (r.error ?? ''), { id: tid }); return; }
      }

      updateOsLocally('in_progress');
      toast.success('Check-in realizado!', { id: tid });
    } finally {
      setProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (!allChecklistDone) { toast.error('Complete todos os itens do checklist.'); return; }
    if (!signatureData) { toast.error('Assinatura do cliente é obrigatória.'); return; }
    openCamera('checkout');
  };

  const handleCaptureAndCheckout = async () => {
    const img = capturePhoto();
    if (!img) return;
    setPhoto(img);
    setProcessing(true);
    const tid = toast.loading('Finalizando OS...');

    try {
      let pos: GeolocationPosition | null = null;
      try {
        pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
      } catch {}

      let uploadedUrl = img;
      if (navigator.onLine) {
        try {
          const blob = await (await fetch(img)).blob();
          uploadedUrl = await uploadTenantFile('default', 'checkins', `${activeOs.id}_${Date.now()}.jpg`, blob);
          if (isRealOsId(activeOs.id)) {
            registerMedia(activeOs.id, { kind: 'depois', url: uploadedUrl, lat: pos?.coords.latitude, lng: pos?.coords.longitude }).catch(() => {});
          }
        } catch {}
      }

      if (navigator.onLine && isRealOsId(activeOs.id)) {
        const r = await completeServiceOrder(
          activeOs.id,
          {
            checklistTotal: checklist.length,
            checklistDone: checklist.filter((i) => i.done).length,
            photosDepois: 1,
            hasSignature: !!signatureData,
          },
          pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined,
        );
        if (!r.ok) {
          const missing = (r as any).missing?.join(', ') || '';
          toast.error('Conclusão bloqueada. Falta: ' + missing, { id: tid });
          return;
        }

        validatePhoto(activeOs.id, uploadedUrl).then((v) => { if (!v.valid) toast.warning(`Foto: ${v.reason}`); }).catch(() => {});
        generateSummary(activeOs.id).then((s) => toast.message('Resumo gerado', { description: s.summary })).catch(() => {});

        try {
          const dossie = await fetchDossie(activeOs.id).catch(() => undefined);
          await processSignatureAndPdf({ tenantId: 'default', osId: activeOs.id, selectedOs: activeOs, signatureData: signatureData!, dossie });
          toast.success('Comprovante salvo!', { id: tid });
        } catch {
          toast.error('Erro ao gerar comprovante.', { id: tid });
        }
      } else {
        toast.success('OS finalizada!', { id: tid });
      }

      updateOsLocally('completed');
      setActiveOs(null);
      setView('map');
    } finally {
      setProcessing(false);
      setPhoto(null);
      setSignatureData(null);
      setMaterials([]);
    }
  };

  const toggleChecklist = async (itemId: string) => {
    const item = checklist.find((i) => i.id === itemId);
    if (!item) return;
    const updated = checklist.map((i) => i.id === itemId ? { ...i, done: !i.done } : i);
    setChecklist(updated);
    if (navigator.onLine && isRealOsId(activeOs.id)) {
      markChecklistItem(activeOs.id, itemId, !item.done).catch(() => {});
    }
  };

  const updateOsLocally = (status: string) => {
    const updated = osList.map((os) => os.id === activeOs.id ? { ...os, status: status as any } : os);
    setOsList(updated);
    setActiveOs({ ...activeOs, status: status as any });
  };

  const handleNavigate = async () => {
    if (!gps || !activeOs.latitude || !activeOs.longitude) {
      window.open(`https://waze.com/ul?ll=${activeOs.latitude},${activeOs.longitude}&navigate=yes`, '_blank');
      return;
    }
    const route = await fetchOsrmRoute([[gps.lat, gps.lng], [activeOs.latitude, activeOs.longitude]]);
    if (route) startNavigation(route, activeOs);
  };

  return (
    <div className="h-full overflow-y-auto pb-20 bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <button onClick={() => { setActiveOs(null); setView('map'); }} className="p-1 text-zinc-400">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-sm truncate">OS — {activeOs.client}</h2>
          <p className="text-zinc-500 text-xs truncate">{activeOs.type}</p>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Status Timeline */}
        <StatusTimeline status={activeOs.status} />

        {/* Client Dossier */}
        <ClientDossier osId={activeOs.id} clientName={activeOs.client} address={activeOs.address} type={activeOs.type} />

        {/* Action buttons by phase */}
        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-3 space-y-2">
            {activeOs.status === 'pending' && (
              <div className="space-y-2">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleNavigate}>
                  <Navigation size={16} className="mr-2" /> Ir para o cliente
                </Button>
                <Button variant="outline" className="w-full" onClick={handleCheckin}>
                  <Camera size={16} className="mr-2" /> Check-in (cheguei)
                </Button>
              </div>
            )}

            {activeOs.status === 'in_progress' && (
              <div className="space-y-3">
                {/* Checklist */}
                <div>
                  <p className="text-zinc-400 text-xs font-medium mb-2">Checklist ({checklist.filter((i) => i.done).length}/{checklist.length})</p>
                  <div className="space-y-1">
                    {checklist.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => toggleChecklist(item.id)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                          item.done ? 'bg-green-900/20' : 'bg-zinc-900/50 active:bg-zinc-800'
                        }`}
                      >
                        {item.done ? <CheckCircle2 size={16} className="text-green-500" /> : <div className="w-4 h-4 rounded-full border border-zinc-600" />}
                        <span className={`text-xs flex-1 ${item.done ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                          {item.text || item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tools row */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openCamera('equipment')}>
                    <Camera size={14} className="mr-1" /> Foto
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowScanner(true)}>
                    <QrCode size={14} className="mr-1" /> QR Code
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowSignature(true)}>
                    <PenTool size={14} className="mr-1" /> Assinar
                  </Button>
                </div>

                {/* Materials scanned */}
                {materials.length > 0 && (
                  <div>
                    <p className="text-zinc-400 text-xs font-medium mb-1">Materiais ({materials.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {materials.map((m, i) => (
                        <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signature status */}
                {signatureData && (
                  <div className="flex items-center gap-2 p-2 bg-green-900/20 rounded-lg">
                    <CircleCheck size={14} className="text-green-500" />
                    <span className="text-xs text-green-400">Assinatura capturada</span>
                  </div>
                )}

                {/* Complete button */}
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={handleCheckout}
                  disabled={processing || !allChecklistDone || !signatureData}
                >
                  {processing ? 'Processando...' : 'Finalizar OS'}
                </Button>
                {(!allChecklistDone || !signatureData) && (
                  <p className="text-xs text-zinc-600 text-center">
                    {!allChecklistDone && 'Complete o checklist. '}
                    {!signatureData && 'Obtenha a assinatura.'}
                  </p>
                )}
              </div>
            )}

            {activeOs.status === 'completed' && (
              <div className="text-center py-4">
                <CircleCheck size={32} className="text-green-500 mx-auto mb-2" />
                <p className="text-green-400 text-sm font-medium">OS Concluída</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Camera Modal */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            <video ref={videoRef} className="flex-1 object-cover" autoPlay playsInline muted />
            <div className="flex items-center justify-center gap-6 p-6 bg-black/80">
              <button onClick={stopCamera} className="p-3 bg-zinc-800 rounded-full text-white">
                <ArrowLeft size={20} />
              </button>
              <button
                onClick={cameraMode === 'checkin' ? handleCaptureAndCheckin : cameraMode === 'checkout' ? handleCaptureAndCheckout : () => { capturePhoto(); }}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:scale-90 transition-transform"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {showSignature && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col items-center justify-center p-6"
          >
            <h3 className="text-white font-semibold mb-4">Assinatura do Cliente</h3>
            <SignaturePad
              onConfirm={(data: string) => {
                setSignatureData(data);
                setShowSignature(false);
                toast.success('Assinatura capturada!');
              }}
              onClear={() => setSignatureData(null)}
            />
            <button onClick={() => setShowSignature(false)} className="mt-4 text-zinc-500 text-sm">
              Cancelar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Scanner */}
      <AnimatePresence>
        {showScanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col items-center justify-center p-6"
          >
            <h3 className="text-white font-semibold mb-4">Scanner de Material</h3>
            <div id="qr-reader" className="w-full max-w-sm" />
            <button onClick={() => setShowScanner(false)} className="mt-4 text-zinc-500 text-sm">
              Cancelar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClipboardEmpty() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}
