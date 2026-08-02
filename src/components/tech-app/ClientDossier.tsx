import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Phone, MapPin, Wifi, AlertCircle,
  Package, Clock, FileText, User,
} from 'lucide-react';
import { fetchDossie } from '../../lib/fieldOps';

interface ClientDossierProps {
  osId: string;
  clientName: string;
  address: string;
  type: string;
}

export function ClientDossier({ osId, clientName, address, type }: ClientDossierProps) {
  const [expanded, setExpanded] = useState(false);
  const [dossie, setDossie] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || dossie) return;
    setLoading(true);
    fetchDossie(osId)
      .then(setDossie)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, osId]);

  return (
    <div className="bg-zinc-800/50 rounded-xl overflow-hidden">
      {/* Header - always visible */}
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <User size={14} className="text-indigo-400 flex-shrink-0" />
              <h3 className="text-white font-semibold text-sm truncate">{clientName}</h3>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin size={12} className="text-zinc-500 flex-shrink-0" />
              <p className="text-zinc-400 text-xs truncate">{address}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Package size={12} className="text-zinc-500 flex-shrink-0" />
              <p className="text-zinc-400 text-xs">{type}</p>
            </div>
          </div>
          {dossie?.customer?.phone && (
            <a
              href={`tel:${dossie.customer.phone}`}
              className="p-2 bg-green-600/20 rounded-lg text-green-400 active:scale-95 transition-transform flex-shrink-0"
            >
              <Phone size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-zinc-500 text-xs border-t border-zinc-700/50 active:bg-zinc-700/30 transition-colors"
      >
        {expanded ? 'Recolher dossiê' : 'Ver dossiê completo'}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-zinc-700/50">
              {loading && (
                <p className="text-zinc-500 text-xs py-2 text-center">Carregando dossiê...</p>
              )}

              {dossie && (
                <>
                  {/* Plan info */}
                  {dossie.customer?.plan && (
                    <div className="pt-2">
                      <p className="text-zinc-500 text-xs font-medium mb-1">Plano</p>
                      <div className="flex items-center gap-2">
                        <Wifi size={12} className="text-indigo-400" />
                        <span className="text-white text-xs">{dossie.customer.plan}</span>
                      </div>
                    </div>
                  )}

                  {/* Recent tickets */}
                  {dossie.recentTickets?.length > 0 && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">Últimos tickets</p>
                      <div className="space-y-1">
                        {dossie.recentTickets.slice(0, 5).map((ticket: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 py-1 px-2 bg-zinc-900/50 rounded-lg">
                            <AlertCircle size={10} className={ticket.status === 'resolved' ? 'text-green-500' : 'text-yellow-500'} />
                            <span className="text-xs text-zinc-300 truncate flex-1">{ticket.subject}</span>
                            <span className="text-[10px] text-zinc-600">{ticket.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Equipment */}
                  {dossie.equipment?.length > 0 && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">Equipamentos</p>
                      <div className="space-y-1">
                        {dossie.equipment.map((eq: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 py-1 px-2 bg-zinc-900/50 rounded-lg">
                            <Package size={10} className="text-zinc-400" />
                            <span className="text-xs text-zinc-300 truncate">{eq.name || eq.model}</span>
                            {eq.serial && <span className="text-[10px] text-zinc-600">#{eq.serial}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timeline events */}
                  {dossie.timeline?.length > 0 && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">Timeline</p>
                      <div className="space-y-1">
                        {dossie.timeline.slice(0, 5).map((evt: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 py-1">
                            <Clock size={10} className="text-zinc-600" />
                            <span className="text-xs text-zinc-400">{evt.event}</span>
                            {evt.timestamp && (
                              <span className="text-[10px] text-zinc-600 ml-auto">
                                {new Date(evt.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {dossie.notes && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">Observações</p>
                      <p className="text-zinc-400 text-xs bg-zinc-900/50 rounded-lg p-2">{dossie.notes}</p>
                    </div>
                  )}
                </>
              )}

              {!loading && !dossie && (
                <p className="text-zinc-600 text-xs py-2 text-center">Dossiê indisponível</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
