import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Phone, MapPin, Wifi, AlertCircle,
  Package, Clock, FileText, User,
} from 'lucide-react';
import { fetchDossie } from '../../lib/fieldOps';
import { tech } from './theme';

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
    <div style={{ background: tech.card, borderRadius: '16px', border: `1px solid ${tech.borderSubtle}` }} className="overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: tech.accentDim }}
              >
                <User size={14} style={{ color: tech.accent }} />
              </div>
              <h3 className="font-bold text-[15px] truncate" style={{ color: tech.text }}>{clientName}</h3>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 ml-[42px]">
              <MapPin size={12} style={{ color: tech.textMuted }} className="flex-shrink-0" />
              <p className="text-xs truncate" style={{ color: tech.textSecondary }}>{address}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1 ml-[42px]">
              <Package size={12} style={{ color: tech.textMuted }} className="flex-shrink-0" />
              <p className="text-xs" style={{ color: tech.textSecondary }}>{type}</p>
            </div>
          </div>
          {dossie?.customer?.phone && (
            <a
              href={`tel:${dossie.customer.phone}`}
              className="p-2.5 active:scale-95 transition-transform flex-shrink-0"
              style={{
                background: tech.accentDim,
                borderRadius: '12px',
              }}
            >
              <Phone size={16} style={{ color: tech.accent }} />
            </a>
          )}
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium active:opacity-80 transition-colors"
        style={{ color: tech.accent, borderTop: `1px solid ${tech.borderSubtle}` }}
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
            <div className="px-4 pb-4 space-y-3" style={{ borderTop: `1px solid ${tech.borderSubtle}` }}>
              {loading && (
                <p className="text-xs py-3 text-center" style={{ color: tech.textMuted }}>Carregando dossiê...</p>
              )}

              {dossie && (
                <>
                  {dossie.customer?.plan && (
                    <div className="pt-3">
                      <p className="text-xs font-semibold mb-1.5" style={{ color: tech.textMuted }}>Plano</p>
                      <div
                        className="flex items-center gap-2 p-2.5"
                        style={{ background: tech.elevated, borderRadius: '10px' }}
                      >
                        <Wifi size={12} style={{ color: tech.accent }} />
                        <span className="text-xs font-medium" style={{ color: tech.text }}>{dossie.customer.plan}</span>
                      </div>
                    </div>
                  )}

                  {dossie.recentTickets?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: tech.textMuted }}>Últimos tickets</p>
                      <div className="space-y-1.5">
                        {dossie.recentTickets.slice(0, 5).map((ticket: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 py-2 px-2.5"
                            style={{ background: tech.elevated, borderRadius: '10px' }}
                          >
                            <AlertCircle size={10} style={{ color: ticket.status === 'resolved' ? tech.done : tech.pending }} />
                            <span className="text-xs truncate flex-1" style={{ color: tech.textSecondary }}>{ticket.subject}</span>
                            <span className="text-[10px]" style={{ color: tech.textMuted }}>{ticket.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dossie.equipment?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: tech.textMuted }}>Equipamentos</p>
                      <div className="space-y-1.5">
                        {dossie.equipment.map((eq: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 py-2 px-2.5"
                            style={{ background: tech.elevated, borderRadius: '10px' }}
                          >
                            <Package size={10} style={{ color: tech.textSecondary }} />
                            <span className="text-xs truncate" style={{ color: tech.textSecondary }}>{eq.name || eq.model}</span>
                            {eq.serial && <span className="text-[10px]" style={{ color: tech.textMuted }}>#{eq.serial}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dossie.timeline?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: tech.textMuted }}>Timeline</p>
                      <div className="space-y-1">
                        {dossie.timeline.slice(0, 5).map((evt: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 py-1.5">
                            <Clock size={10} style={{ color: tech.textDim }} />
                            <span className="text-xs" style={{ color: tech.textSecondary }}>{evt.event}</span>
                            {evt.timestamp && (
                              <span className="text-[10px] ml-auto" style={{ color: tech.textDim }}>
                                {new Date(evt.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dossie.notes && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: tech.textMuted }}>Observações</p>
                      <p className="text-xs p-2.5" style={{ color: tech.textSecondary, background: tech.elevated, borderRadius: '10px' }}>
                        {dossie.notes}
                      </p>
                    </div>
                  )}
                </>
              )}

              {!loading && !dossie && (
                <p className="text-xs py-3 text-center" style={{ color: tech.textDim }}>Dossiê indisponível</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
