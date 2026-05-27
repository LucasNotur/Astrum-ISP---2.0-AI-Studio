import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/src/components/ui/card";
import { useAppStore } from "@/src/store/useAppStore";
import { Loader2 } from "lucide-react";

export function BIPage() {
  const { user } = useAppStore();
  const tenantId = user?.tenantId;
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    
    // Simulate fetching the Metabase JWT embedded URL from the backend
    fetch(`/api/bi/metabase-url?tenantId=${tenantId}`)
      .then(res => res.json())
      .then(data => {
        if (data.url) {
           setIframeUrl(data.url);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

  }, [tenantId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business Intelligence</h1>
        <p className="text-zinc-500">Dashboards e métricas em tempo real via Metabase.</p>
      </div>

      <Card className="border-none shadow-sm h-[calc(100vh-200px)]">
        <CardContent className="h-full p-0">
           {loading ? (
               <div className="h-full w-full flex flex-col items-center justify-center gap-2">
                   <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                   <span className="text-sm text-zinc-500">Carregando painel de BI...</span>
               </div>
           ) : iframeUrl ? (
               <iframe
                 src={iframeUrl}
                 frameBorder="0"
                 width="100%"
                 height="100%"
                 allowTransparency
                 className="w-full h-full rounded-b-xl md:rounded-xl bg-white"
               ></iframe>
           ) : (
               <div className="h-full w-full flex items-center justify-center">
                   <p className="text-zinc-500">Painel de BI não configurado para esta organização.</p>
               </div>
           )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
