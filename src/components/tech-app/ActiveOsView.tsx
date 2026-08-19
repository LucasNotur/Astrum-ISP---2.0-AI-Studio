import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, CheckCircle2, QrCode, PenTool, Navigation, ArrowLeft,
  Upload, AlertTriangle, CircleCheck, ScanSearch, Phone, MapPin,
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Headset, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useTechAppStore } from '../../store/techAppStore';
import { StatusTimeline } from './StatusTimeline';
import { ClientDossier } from './ClientDossier';
import { SlideToConfirm } from './SlideToConfirm';
import { OsReceipt } from './OsReceipt';
import { tech } from './theme';
import { SignaturePad } from '../SignaturePad';
import { uploadTenantFile } from '../../lib/storage';
import { processSignatureAndPdf } from '../../lib/signaturePad';
import { fetchOsrmRoute } from '../../lib/osrm';
import {
  startServiceOrder, completeServiceOrder, fetchChecklist, markChecklistItem,
  registerMedia, validatePhoto, generateSummary, fetchDossie,
} from '../../lib/fieldOps';

const isRealOsId = (id: string) => typeof id === 'string' && !id.startsWith('OS-');

export function ActiveOsView() {
  const activeOs = useTechAppStore((s) => s.activeOs);
  const setActiveOs = useTechAppStore((s) => s.setActiveOs);
  const setView = useTechAppStore((s) => s.setView);
  const gps = useTechAppStore((s) => s.gps);
  const startNavigation = useTechAppStore((s) => s.startNavigation);
  const osList = useTechAppStore((s) => s.osList);
  const setOsList = useTechAppStore((s) => s.setOsList);
  const demoMode = useTechAppStore((s) => s.demoMode);

  const [checklist, setChecklist] = useState<any[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [materials, setMaterials] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'checkin' | 'checkout' | 'equipment' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!activeOs) return;
    setChecklist(activeOs.checklist || []);
    if (isRealOsId(activeOs.id) && navigator.onLine) {
      fetchChecklist(activeOs.id)
        .then((items) => { if (items.length > 0) setChecklist(items); })
        .catch(() => {});
    }
  }, [activeOs?.id]);

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
      <div className="flex flex-col items-center justify-center h-full px-6 text-center" style={{ background: tech.bg }}>
        <ClipboardEmpty />
        <p className="text-sm mt-4" style={{ color: tech.textMuted }}>Nenhuma OS selecionada</p>
        <button
          onClick={() => setView('agenda')}
          className="mt-4 px-6 py-2.5 text-sm font-bold active:scale-95 transition-transform"
          style={{
            background: 'transparent',
            color: tech.accent,
            borderRadius: '14px',
            border: `1px solid ${tech.accentBorder}`,
          }}
        >
          Ver agenda
        </button>
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

  // Foto placeholder para o modo demo (simulação só com toques, sem câmera)
  const DEMO_IMG = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#3D5AFE"/></svg>');

  const handleCheckin = async () => {
    if (demoMode) { runCheckin(DEMO_IMG); return; }
    openCamera('checkin');
  };

  const handleCaptureAndCheckin = async () => {
    const img = capturePhoto();
    if (!img) return;
    runCheckin(img);
  };

  const runCheckin = async (img: string) => {
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
          const uploaded = await uploadTenantFile('default', 'checkins', `${activeOs.id}_${Date.now()}.jpg`, blob);
          uploadedUrl = uploaded.url;
          if (isRealOsId(activeOs.id)) {
            // APPSEC-02: persiste o PATH (não a URL assinada, que expira) — resign na renderização.
            registerMedia(activeOs.id, { kind: 'antes', url: uploaded.path, lat: pos?.coords.latitude, lng: pos?.coords.longitude }).catch(() => {});
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
    if (demoMode) { runCheckout(DEMO_IMG); return; }
    openCamera('checkout');
  };

  const handleCaptureAndCheckout = async () => {
    const img = capturePhoto();
    if (!img) return;
    runCheckout(img);
  };

  const runCheckout = async (img: string) => {
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
          const uploaded = await uploadTenantFile('default', 'checkins', `${activeOs.id}_${Date.now()}.jpg`, blob);
          uploadedUrl = uploaded.url;
          if (isRealOsId(activeOs.id)) {
            // APPSEC-02: persiste o PATH (não a URL assinada, que expira) — resign na renderização.
            registerMedia(activeOs.id, { kind: 'depois', url: uploaded.path, lat: pos?.coords.latitude, lng: pos?.coords.longitude }).catch(() => {});
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
      setShowReceipt(true); // comprovante estilo boarding pass
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
    <div className="h-full overflow-y-auto pb-20" style={{ background: tech.bg }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{
          background: `${tech.bg}f2`,
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${tech.border}`,
        }}
      >
        <button
          onClick={() => { setActiveOs(null); setView('map'); }}
          className="p-1.5 active:scale-90 transition-transform"
          style={{ color: tech.textSecondary }}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-[15px] truncate" style={{ color: tech.text }}>OS — {activeOs.client}</h2>
          <p className="text-xs truncate" style={{ color: tech.textMuted }}>{activeOs.type}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Status Timeline */}
        <StatusTimeline status={activeOs.status} />

        {/* Client Dossier */}
        <ClientDossier osId={activeOs.id} clientName={activeOs.client} address={activeOs.address} type={activeOs.type} />

        {/* Action buttons by phase */}
        <div style={{ background: tech.card, borderRadius: '16px', border: `1px solid ${tech.borderSubtle}` }} className="p-4 space-y-3">
          {activeOs.status === 'pending' && (
            <div className="space-y-3">
              <button
                onClick={handleNavigate}
                className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: tech.accent,
                  color: tech.onAccent,
                  borderRadius: '14px',
                }}
              >
                <Navigation size={16} /> Ir para o cliente
              </button>
              {/* Check-in por deslizar — evita toque acidental */}
              <SlideToConfirm
                label="Arraste para confirmar chegada"
                confirmedLabel="Chegou! Abrindo câmera…"
                onConfirm={handleCheckin}
              />
            </div>
          )}

          {activeOs.status === 'in_progress' && (
            <div className="space-y-4">
              {/* Checklist */}
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: tech.textMuted }}>
                  Checklist ({checklist.filter((i) => i.done).length}/{checklist.length})
                </p>
                <div className="space-y-1.5">
                  {checklist.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklist(item.id)}
                      className="w-full flex items-center gap-3 p-3 text-left transition-all active:opacity-80"
                      style={{
                        borderRadius: '12px',
                        background: item.done ? tech.accentDim : tech.elevated,
                        border: item.done ? `1px solid ${tech.accentBorder}` : `1px solid ${tech.border}`,
                      }}
                    >
                      {item.done ? (
                        <CheckCircle2 size={18} style={{ color: tech.accent }} />
                      ) : (
                        <div className="w-[18px] h-[18px] rounded-full" style={{ border: `2px solid ${tech.textDim}` }} />
                      )}
                      <span
                        className="text-xs flex-1"
                        style={{
                          color: item.done ? tech.textMuted : tech.textSecondary,
                          textDecoration: item.done ? 'line-through' : 'none',
                        }}
                      >
                        {item.text || item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tools row */}
              <div className="flex gap-2">
                {[
                  { icon: Camera, label: 'Foto', action: () => openCamera('equipment') },
                  { icon: QrCode, label: 'QR Code', action: () => setShowScanner(true) },
                  { icon: PenTool, label: 'Assinar', action: () => setShowSignature(true) },
                ].map(({ icon: Icon, label, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold active:scale-95 transition-transform"
                    style={{
                      background: tech.elevated,
                      border: `1px solid ${tech.border}`,
                      borderRadius: '12px',
                      color: tech.textSecondary,
                    }}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>

              {/* Materials scanned */}
              {materials.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-1.5" style={{ color: tech.textMuted }}>Materiais ({materials.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {materials.map((m, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1"
                        style={{ background: tech.elevated, color: tech.textSecondary, borderRadius: '8px' }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Signature status */}
              {signatureData && (
                <div
                  className="flex items-center gap-2 p-3"
                  style={{
                    background: tech.accentDim,
                    borderRadius: '12px',
                    border: `1px solid ${tech.accentBorder}`,
                  }}
                >
                  <CircleCheck size={14} style={{ color: tech.accent }} />
                  <span className="text-xs font-medium" style={{ color: tech.accent }}>Assinatura capturada</span>
                </div>
              )}

              {/* Concluir por deslizar */}
              <SlideToConfirm
                label={processing ? 'Processando…' : 'Arraste para concluir OS'}
                confirmedLabel="Concluindo…"
                color={tech.done}
                disabled={processing || !allChecklistDone || !signatureData}
                onConfirm={handleCheckout}
              />
              {(!allChecklistDone || !signatureData) && (
                <p className="text-xs text-center" style={{ color: tech.textDim }}>
                  {!allChecklistDone && 'Complete o checklist. '}
                  {!signatureData && 'Obtenha a assinatura.'}
                </p>
              )}

              {/* Falar com a central — inspirado no "chat with support" */}
              <button
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold active:scale-95 transition-transform"
                style={{ background: 'transparent', color: tech.textSecondary, borderRadius: '12px', border: `1px solid ${tech.border}` }}
                onClick={() => toast.message('Central de operações', { description: 'Abrindo canal com o despacho…' })}
              >
                <Headset size={14} /> Falar com a central
              </button>
            </div>
          )}

          {activeOs.status === 'completed' && (
            <div className="text-center py-6">
              <div className="mx-auto mb-3 flex items-center justify-center rounded-full"
                style={{ width: 48, height: 48, background: tech.accentDim }}>
                <CircleCheck size={28} style={{ color: tech.done }} />
              </div>
              <p className="text-sm font-bold mb-4" style={{ color: tech.done }}>OS Concluída</p>
              <button
                onClick={() => setShowReceipt(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
                style={{ background: tech.accent, color: tech.onAccent, borderRadius: '14px' }}
              >
                <FileText size={16} /> Ver comprovante
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comprovante estilo boarding pass */}
      <AnimatePresence>
        {showReceipt && activeOs && (
          <OsReceipt
            os={activeOs}
            onClose={() => {
              setShowReceipt(false);
              if (activeOs.status === 'completed') { setActiveOs(null); setView('map'); }
            }}
            onDownload={() => toast.success('Comprovante em PDF gerado!')}
          />
        )}
      </AnimatePresence>

      {/* Camera Modal */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: '#000' }}
          >
            <video ref={videoRef} className="flex-1 object-cover" autoPlay playsInline muted />
            <div className="flex items-center justify-center gap-8 p-6" style={{ background: 'rgba(0,0,0,0.9)' }}>
              <button onClick={stopCamera} className="p-3 rounded-full" style={{ background: '#1a1a1a' }}>
                <ArrowLeft size={20} style={{ color: '#fff' }} />
              </button>
              <button
                onClick={cameraMode === 'checkin' ? handleCaptureAndCheckin : cameraMode === 'checkout' ? handleCaptureAndCheckout : () => { capturePhoto(); }}
                className="w-16 h-16 rounded-full active:scale-90 transition-transform"
                style={{ border: '4px solid #3D5AFE', background: 'rgba(61,90,254,0.15)' }}
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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
            style={{ background: 'rgba(10,10,10,0.97)' }}
          >
            <h3 className="text-white font-bold text-lg mb-4">Assinatura do Cliente</h3>
            <SignaturePad
              onConfirm={(data: string) => {
                setSignatureData(data);
                setShowSignature(false);
                toast.success('Assinatura capturada!');
              }}
              onClear={() => setSignatureData(null)}
            />
            <button
              onClick={() => setShowSignature(false)}
              className="mt-4 text-sm"
              style={{ color: '#555' }}
            >
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
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
            style={{ background: 'rgba(10,10,10,0.97)' }}
          >
            <h3 className="text-white font-bold text-lg mb-4">Scanner de Material</h3>
            <div id="qr-reader" className="w-full max-w-sm" />
            <button
              onClick={() => setShowScanner(false)}
              className="mt-4 text-sm"
              style={{ color: '#555' }}
            >
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
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: tech.textDim }}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}
