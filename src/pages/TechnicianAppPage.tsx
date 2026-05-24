import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { openDB } from "idb";
import jsPDF from "jspdf";
import { storage, db as firestoreDb } from "../lib/firebase"; // imported firestore if needed, but not required yet
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { SignaturePad } from "../components/SignaturePad";
import { Html5QrcodeScanner } from "html5-qrcode";
import {
  MapPin,
  Camera,
  CheckCircle2,
  Clock,
  ChevronRight,
  ArrowLeft,
  PenTool,
  Upload,
  QrCode
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

// Mock Data for OSs (Ordem de Serviço)
const MOCK_OSS = [
  {
    id: "OS-1023",
    title: "Instalação FTTH - Plano 500MB",
    client: "João da Silva",
    address: "Rua das Flores, 123 - Centro",
    scheduledTime: "10:00",
    status: "pending",
    type: "installation",
    checklist: [
      { id: "c1", text: "Passagem de cabo drop", done: false },
      { id: "c2", text: "Instalação da roseta", done: false },
      { id: "c3", text: "Configuração do roteador Wi-Fi", done: false },
      { id: "c4", text: "Teste de velocidade", done: false },
    ],
  },
  {
    id: "OS-1024",
    title: "Reparo - Rompimento Externo",
    client: "Maria Oliveira",
    address: "Av. Paulista, 1500 - Bela Vista",
    scheduledTime: "14:30",
    status: "pending",
    type: "repair",
    checklist: [
      { id: "c1", text: "Localização da falha", done: false },
      { id: "c2", text: "Fusão de fibra", done: false },
      { id: "c3", text: "Validação de potência óptica", done: false },
    ],
  },
];

// IDB setup
const dbPromise = openDB('astrum-tech-db', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('oss')) {
      db.createObjectStore('oss', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('sync-queue')) {
      db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
    }
  },
});

export default function TechnicianAppPage() {
  const [oss, setOss] = useState(MOCK_OSS);
  const [selectedOs, setSelectedOs] = useState<any>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<"checkin" | "checkout" | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const [materials, setMaterials] = useState<string[]>([]);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (showScanner) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scanner.render(
        (decodedText) => {
          setMaterials((prev) => {
             if (!prev.includes(decodedText)) {
                toast.success(`Material adicionado: ${decodedText}`);
                return [...prev, decodedText];
             }
             return prev;
          });
          scanner.clear();
          setShowScanner(false);
        },
        (error) => {} // ignore errors while scanning
      );

      return () => {
         scanner.clear().catch(console.error);
      };
    }
  }, [showScanner]);

  useEffect(() => {
    // IDB load
    const loadOss = async () => {
      const db = await dbPromise;
      const cachedOss = await db.getAll('oss');
      if (cachedOss.length > 0) {
        setOss(cachedOss);
      } else {
        const tx = db.transaction('oss', 'readwrite');
        for (const os of MOCK_OSS) {
          tx.store.put(os);
        }
        await tx.done;
        setOss(MOCK_OSS);
      }
    };
    loadOss();
    
    // Service Worker Registration
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("SW registered: ", registration);
        })
        .catch((registrationError) => {
          console.log("SW registration failed: ", registrationError);
        });
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const handleOnline = () => {
      setIsOnline(true);
      syncWithFirestore();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const addToSyncQueue = async (action: string, payload: any) => {
    const db = await dbPromise;
    await db.add('sync-queue', {
      action,
      payload,
      timestamp: Date.now()
    });
    
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      try {
        await (reg as any).sync.register('sync-oss');
      } catch (e) {
        console.log("Background sync failed to register", e);
      }
    }
  };

  const syncWithFirestore = async () => {
    if (!navigator.onLine) return;
    const db = await dbPromise;
    const queue = await db.getAll('sync-queue');
    if (queue.length === 0) return;
    
    toast.loading("Sincronizando dados offline...", { id: "sync" });
    try {
      for (const item of queue) {
        // Simulando envio pro Firebase/Firestore
        console.log("Sincronizando via background sync ou reconnect:", item);
        await new Promise(r => setTimeout(r, 500)); 
        await db.delete('sync-queue', item.id);
      }
      toast.success("Sincronização concluída!", { id: "sync" });
    } catch (e) {
      toast.error("Erro na sincronização.", { id: "sync" });
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
  };

  const openCamera = async (mode: "checkin" | "checkout") => {
    setCameraMode(mode);
    setIsCameraModalOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      toast.error("Erro ao acessar a câmera.");
      setIsCameraModalOpen(false);
    }
  };

  const captureAndProceed = async () => {
    if (!videoRef.current || !cameraMode) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg");
    stopCamera();
    setIsCameraModalOpen(false);

    // After getting picture, get location
    if ("geolocation" in navigator) {
      const toastId = toast.loading(`Processando ${cameraMode === "checkin" ? "Check-in" : "Check-out"}...`);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setGpsLocation({ lat, lng });

          const tenantId = "default";
          const osId = selectedOs.id;
          const ts = Date.now();
          let uploadedUrl = dataUrl; // fallback

          if (navigator.onLine) {
            try {
              toast.loading("Enviando foto...", { id: toastId });
              const photoRef = ref(storage, `tenants/${tenantId}/checkins/${osId}_${ts}.jpg`);
              await uploadString(photoRef, dataUrl, "data_url");
              uploadedUrl = await getDownloadURL(photoRef);
            } catch (e: any) {
              console.error(e);
              toast.error("Salvo apenas localmente. Erro no Firebase: " + e.message, { id: toastId });
            }
          }

          if (cameraMode === "checkin") {
             const actionDetails = { 
               checkin_at: new Date().toISOString(), 
               checkin_lat: lat, 
               checkin_lng: lng, 
               checkin_photo_url: uploadedUrl 
             };
             await updateOsStatus(selectedOs.id, "in_progress", actionDetails);
             toast.success("Check-in realizado com sucesso!", { id: toastId });
          } else {
             const actionDetails = { 
               checkout_at: new Date().toISOString(), 
               checkout_lat: lat, 
               checkout_lng: lng, 
               checkout_photo_url: uploadedUrl,
               photo, signatureData, materials
             };
             // Proceed with checkout logic that was in handleCheckOut
             await processCheckOut(actionDetails, toastId);
          }
        },
        (error) => {
          toast.error("Erro ao obter localização: " + error.message);
        }
      );
    } else {
      toast.error("Geolocalização não suportada.");
    }
  };

  const handleCheckIn = () => {
    openCamera("checkin");
  };

  const updateOsStatus = async (id: string, newStatus: string, actionDetails: any = null) => {
    const updatedOss = oss.map((os) => (os.id === id ? { ...os, status: newStatus } : os));
    setOss(updatedOss);
    setSelectedOs((prev: any) => ({ ...prev, status: newStatus }));

    const db = await dbPromise;
    const osToUpdate = updatedOss.find(os => os.id === id);
    if (osToUpdate) {
      await db.put('oss', osToUpdate);
    }

    if (!navigator.onLine) {
      await addToSyncQueue('update_os', { id, newStatus, actionDetails });
    } else {
      console.log("Sincronizando edição de OS:", { id, newStatus, actionDetails });
    }
  };

  const toggleChecklistItem = async (itemId: string) => {
    const updatedChecklist = selectedOs.checklist.map((item: any) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    const updatedOs = { ...selectedOs, checklist: updatedChecklist };
    setSelectedOs(updatedOs);
    
    // Update in main list as well
    const updatedOss = oss.map((os) =>
      os.id === selectedOs.id ? updatedOs : os
    );
    setOss(updatedOss);

    const db = await dbPromise;
    await db.put('oss', updatedOs);

    if (!navigator.onLine) {
      await addToSyncQueue('update_checklist', { id: selectedOs.id, checklist: updatedChecklist });
    }
  };

  const allChecklistDone = selectedOs?.checklist.every((item: any) => item.done);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          // Configurable size limit: max 1024px
          const MAX_SIZE = 1024;
          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(img, 0, 0, width, height);
             // compress with 0.7 quality
             setPhoto(canvas.toDataURL('image/jpeg', 0.7));
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const processCheckOut = async (actionDetails: any, toastId: string | number) => {
    toast.success("Ordem de Serviço finalizada com sucesso!", { id: toastId });
    
    const tenantId = "default";
    const osId = selectedOs.id;
    
    if (navigator.onLine) {
       toast.loading("Enviando contrato...", { id: "upload" });
       try {
         const sigRef = ref(storage, `tenants/${tenantId}/signatures/${osId}.png`);
         await uploadString(sigRef, signatureData!, "data_url");
         
         const doc = new jsPDF();
         doc.setFontSize(16);
         doc.text(`Ordem de Servico: ${osId}`, 20, 20);
         doc.setFontSize(12);
         doc.text(`Cliente: ${selectedOs.client}`, 20, 30);
         doc.text(`Endereco: ${selectedOs.address}`, 20, 40);
         doc.text(`Data: ${new Date().toLocaleString()}`, 20, 50);
         doc.text("Assinatura do Cliente:", 20, 80);
         doc.addImage(signatureData!, "PNG", 20, 90, 80, 40);
         
         const pdfDataUri = doc.output("datauristring");
         const pdfRef = ref(storage, `tenants/${tenantId}/contracts/${osId}.pdf`);
         await uploadString(pdfRef, pdfDataUri, "data_url");
         
         toast.success("Contrato salvo na nuvem com sucesso!", { id: "upload" });
       } catch (e: any) {
         console.error(e);
         // Erros prováveis: missing/insufficient permissions, mock env
         toast.error("Não foi possível enviar arquivos: " + e.message, { id: "upload" });
       }
    }

    updateOsStatus(selectedOs.id, "completed", actionDetails);
    setSelectedOs(null);
    setGpsLocation(null);
    setPhoto(null);
    setSignatureData(null);
  };

  const handleCheckOut = async () => {
    if (!allChecklistDone) {
      toast.error("Conclua todos os itens do checklist antes de finalizar.");
      return;
    }
    if (!signatureData) {
      toast.error("A assinatura digital do cliente é obrigatória.");
      return;
    }
    openCamera("checkout");
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
  };

  const handleOptimizeRoute = async () => {
    if (!isOnline) {
      toast.error('Necessário conexão para otimizar rota');
      return;
    }
    setIsOptimizing(true);
    const toastId = toast.loading("Calculando melhor rota...");
    try {
      const res = await fetch('/api/os/optimize-route?technicianId=tec-123&date=2023-10-10');
      const data = await res.json();
      if (data.route) {
        setOptimizedRoute(data);
        toast.success("Rota otimizada!", { id: toastId });
      } else {
        toast.error("Falha ao otimizar", { id: toastId });
      }
    } catch(e) {
      toast.error("Erro na otimização", { id: toastId });
    } finally {
      setIsOptimizing(false);
    }
  };

  if (selectedOs) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col pb-20">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b dark:border-zinc-800 p-4 flex items-center gap-3">
          <button onClick={() => setSelectedOs(null)} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-lg">{selectedOs.id}</h1>
            <p className="text-xs text-zinc-500">{selectedOs.title}</p>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            selectedOs.status === 'completed' ? 'bg-green-100 text-green-700' :
            selectedOs.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {selectedOs.status === 'completed' ? 'Finalizado' :
             selectedOs.status === 'in_progress' ? 'Em Andamento' :
             'Pendente'}
          </div>
        </header>

        <main className="flex-1 p-4 space-y-6 max-w-lg mx-auto w-full">
          {/* Info Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">{selectedOs.client}</h2>
                  <p className="text-sm text-zinc-500 mt-1">{selectedOs.address}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedOs.status === "pending" && (
            <Button onClick={handleCheckIn} className="w-full h-14 text-lg" size="lg">
              <MapPin className="w-5 h-5 auto mr-2" />
              Fazer Check-in (GPS)
            </Button>
          )}

          {selectedOs.status === "in_progress" && (
             <div className="space-y-6">
                <div>
                   <h3 className="text-sm font-semibold text-zinc-500 tracking-wider uppercase mb-3">Checklist de Execução</h3>
                   <Card>
                      <CardContent className="p-0 divide-y dark:divide-zinc-800">
                         {selectedOs.checklist.map((item: any) => (
                           <label key={item.id} className="flex items-center gap-3 p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                             <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-blue-500 border-blue-500 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                                {item.done && <CheckCircle2 className="w-4 h-4" />}
                             </div>
                             <span className={`text-sm ${item.done ? 'line-through text-zinc-400' : ''}`}>{item.text}</span>
                           </label>
                         ))}
                      </CardContent>
                   </Card>
                </div>

                <div>
                   <h3 className="text-sm font-semibold text-zinc-500 tracking-wider uppercase mb-3">Baixa de Materiais (QR Code)</h3>
                   <Card>
                      <CardContent className="p-4 space-y-4">
                         {materials.length > 0 && (
                            <div className="space-y-2 mb-4">
                               {materials.map((m, idx) => (
                                  <div key={idx} className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 p-2 rounded text-sm">
                                     <span>{m}</span>
                                     <button onClick={() => setMaterials(materials.filter((_, i) => i !== idx))} className="text-red-500 text-xs font-bold uppercase">
                                        Remover
                                     </button>
                                  </div>
                               ))}
                            </div>
                         )}
                         
                         {showScanner ? (
                            <div className="space-y-2">
                               <div id="reader" className="w-full bg-white text-black" />
                               <Button variant="outline" className="w-full" onClick={() => setShowScanner(false)}>Cancelar</Button>
                            </div>
                         ) : (
                            <Button variant="outline" onClick={() => setShowScanner(true)} className="w-full h-12 flex gap-2">
                               <QrCode className="w-5 h-5 text-indigo-500" />
                               Ler QR Code do Material
                            </Button>
                         )}
                      </CardContent>
                   </Card>
                </div>

                <div>
                   <h3 className="text-sm font-semibold text-zinc-500 tracking-wider uppercase mb-3">Assinatura do Cliente</h3>
                   <Card>
                      <CardContent className="p-3">
                         {signatureData ? (
                            <div className="space-y-4">
                               <img src={signatureData} alt="Assinatura Cliente" className="border rounded bg-white w-full object-contain h-[150px]" />
                               <Button variant="ghost" size="sm" onClick={() => setSignatureData(null)} type="button" className="w-full">
                                  Refazer Assinatura
                               </Button>
                            </div>
                         ) : (
                            <div style={{ touchAction: 'none' }}>
                               <SignaturePad onConfirm={setSignatureData} />
                            </div>
                         )}
                      </CardContent>
                   </Card>
                </div>

                <Button 
                  onClick={handleCheckOut} 
                  className="w-full h-14 text-lg" 
                  size="lg"
                  disabled={!allChecklistDone || !photo || !signatureData}
                >
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Finalizar OS e Check-out
                </Button>
             </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col pb-20">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b dark:border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-xl">Agenda do Dia</h1>
            <p className="text-xs text-zinc-500 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          </div>
          {deferredPrompt && (
            <Button size="sm" onClick={handleInstallClick} className="flex gap-2">
               Instalar App
            </Button>
          )}
        </div>
        {!isOnline && (
          <div className="mt-2 text-xs py-1 px-2 border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded flex justify-center uppercase font-bold tracking-wider">
            SISTEMA OFFLINE • DADOS SALVOS LOCALMENTE
          </div>
        )}
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Ordens de Serviço</h2>
           <Button variant="outline" size="sm" onClick={handleOptimizeRoute} disabled={isOptimizing || !isOnline} className="gap-2 text-xs h-8">
             <MapPin className="w-3 h-3" />
             Otimizar Rota
           </Button>
        </div>

        {optimizedRoute && (
           <div className="mb-6 p-4 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/10 rounded-xl space-y-2">
              <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                 <CheckCircle2 className="w-4 h-4" /> Rota Otimizada
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Distância total estimada: <span className="font-bold text-zinc-900 dark:text-zinc-100">{optimizedRoute.totalDistance} km</span></p>
           </div>
        )}

        <div className="space-y-4 relative">
          {(optimizedRoute ? optimizedRoute.route : oss).map((os: any, index: number) => (
            <motion.div
              key={os.id}
              whileTap={{ scale: 0.98 }}
              className="relative"
            >
               {optimizedRoute && (
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold z-10 shadow-sm border-2 border-zinc-50 dark:border-black">
                     {index + 1}
                  </div>
               )}
               <Card 
                 className={`cursor-pointer overflow-hidden border-l-4 ${optimizedRoute ? 'ml-4' : ''} ${
                   os.status === 'completed' ? 'border-l-green-500' :
                   os.status === 'in_progress' ? 'border-l-blue-500' :
                   'border-l-amber-500'
                 }`}
                 onClick={() => setSelectedOs(os)}
               >
                 <CardContent className="p-4 flex items-center justify-between">
                   <div className="space-y-1 pr-4 max-w-[80%]">
                     <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <Clock className="w-4 h-4" />
                        <span>{os.scheduledTime}</span>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">{os.id}</span>
                     </div>
                     <h3 className="font-semibold truncate">{os.title}</h3>
                     <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">{os.client} • {os.address}</p>
                   </div>
                   <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                 </CardContent>
               </Card>
            </motion.div>
          ))}
        </div>
      </main>

      {/* MODAL DE CÂMERA */}
      <AnimatePresence>
        {isCameraModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
               <video ref={videoRef} className="w-full h-full object-cover" playsInline muted></video>
               
               <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                 <button onClick={() => { stopCamera(); setIsCameraModalOpen(false); }} className="text-white p-2">
                   <ArrowLeft className="w-6 h-6" />
                 </button>
                 <span className="text-white font-medium bg-black/50 px-3 py-1 rounded-full text-xs">
                    {cameraMode === "checkin" ? "Foto de Check-in" : "Foto de Check-out"}
                 </span>
                 <div className="w-10"></div>
               </div>

               <div className="absolute bottom-8 inset-x-0 flex justify-center z-10">
                 <button 
                   onClick={captureAndProceed}
                   className="w-16 h-16 rounded-full border-4 border-white bg-white/20 flex items-center justify-center backdrop-blur-sm"
                 >
                   <div className="w-12 h-12 bg-white rounded-full"></div>
                 </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
