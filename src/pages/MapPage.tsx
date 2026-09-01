import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Minus, 
  RefreshCw, 
  Layers, 
  Map as MapIcon,
} from 'lucide-react';
import { GlowButton } from '@/src/components/ui/glow-button';
import { Button } from '@/src/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { cn } from '@/src/lib/utils';
import { useAppStore } from '@/src/store/useAppStore';

// F1-03 — projeção do mapa SVG centrada no RIO DE JANEIRO (antes hardcoded em SP,
// o que jogava toda OS/CTO real do Rio pra fora do viewport 800×600).
const GEO_CENTER = { lat: -22.9068, lng: -43.1789 };
const GEO_SCALE = 3500;
const projX = (lng: number) => 400 + (lng - GEO_CENTER.lng) * GEO_SCALE;
const projY = (lat: number) => 300 - (lat - GEO_CENTER.lat) * GEO_SCALE;
// Ocupação da CTO tolerante ao shape do Supabase (snake_case) com fallback camelCase.
const usedP = (c: any) => Number(c.used_ports ?? c.usedPorts ?? 0);
const totalP = (c: any) => Number(c.total_ports ?? c.totalPorts ?? 0);
const occ = (c: any) => { const t = totalP(c); return t > 0 ? usedP(c) / t : 0; };

export function MapPage() {
  const { ctos, setSelectedCTO, setIsCTODetailOpen, serviceOrders, customers } = useAppStore();
  // We use store for cto list now. So we must set the internal state properly.

  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mapFilter, setMapFilter] = useState('all');
  const [isHeatmapVisible, setIsHeatmapVisible] = useState(false);
  const [isOSLayerVisible, setIsOSLayerVisible] = useState(true);
  const [activeOSPopup, setActiveOSPopup] = useState<any>(null);

  // OS layer: usa serviceOrders reais quando têm coordenadas; fallback para mock só em dev
  const liveOSS = React.useMemo(() => {
    const nameById = new Map<string, string>(
      (customers || []).map((c: any) => [c.id, c.name || c.customerName]),
    );
    const real = serviceOrders
      .map((os: any) => ({ os, lat: os.latitude ?? os.lat, lng: os.longitude ?? os.lng }))
      .filter(({ os, lat, lng }: any) => lat != null && lng != null && os.status !== 'cancelada')
      .map(({ os, lat, lng }: any) => ({
        id: os.id,
        tech: os.assigned_to || os.assignedTo || 'A Definir',
        status: (os.status === 'em_andamento' || os.status === 'em_deslocamento') ? 'in_progress'
              : os.status === 'concluida' ? 'completed'
              : (os.status === 'pendente' || os.status === 'agendada') ? 'pending'
              : 'delayed',
        lat,
        lng,
        client: os.customerName || os.customer_name || nameById.get(os.customer_id) || '—',
        type: os.type || '—',
      }));
    if (real.length > 0) return real;
    // fallback visual (Rio) para quando OS não têm lat/lng ainda — todos no viewport 800×600
    return [
      { id: 'OS-1023', tech: 'Carlos Silva',  status: 'pending',     lat: -22.9110, lng: -43.1760, client: 'João da Silva',  type: 'Instalação FTTH' },
      { id: 'OS-1024', tech: 'Marcos Paulo',  status: 'in_progress', lat: -22.9020, lng: -43.1820, client: 'Maria Oliveira', type: 'Reparo' },
      { id: 'OS-1025', tech: 'Ana Júlia',     status: 'completed',   lat: -22.9080, lng: -43.1750, client: 'Empresa XYZ',    type: 'Mudança Endereço' },
      { id: 'OS-1026', tech: 'Pedro Souza',   status: 'delayed',     lat: -22.9050, lng: -43.1850, client: 'Lucia Costa',    type: 'Nova Instalação' },
    ];
  }, [serviceOrders, customers]);
      
  
  const resetMap = () => {
    setMapZoom(1);
    setMapOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDraggingMap(true);
    setDragStart({ x: e.clientX - mapOffset.x, y: e.clientY - mapOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingMap) return;
    setMapOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDraggingMap(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    setMapZoom(prev => {
      const newZoom = prev - (e.deltaY * zoomSensitivity);
      return Math.min(Math.max(newZoom, 0.5), 5); // Limit zoom between 0.5x and 5x
    });
  };


  return (
    <motion.div 
      key="map"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* D-008 — hero da seção: eyebrow + título display + ações */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapIcon size={13} strokeWidth={1.75} />
            Rede · <span className="font-mono text-foreground">{ctos.length}</span> CTOs mapeadas
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mt-2">
            Mapa da Rede
          </h1>
        </div>
        {/* D-011 — glow CTA: a ação de criação da tela */}
        <GlowButton icon={<Plus size={16} strokeWidth={2.5} />}>
          Nova CTO
        </GlowButton>
      </header>
      
      {/* IA-24 — Saúde da Rede */}
      {ctos.length > 0 && (() => {
        const total    = ctos.length;
        const livre    = ctos.filter((c: any) => occ(c) < 0.8).length;
        const atencao  = ctos.filter((c: any) => { const o = occ(c); return o >= 0.8 && o < 1; }).length;
        const critica  = ctos.filter((c: any) => usedP(c) >= totalP(c) || c.status === 'error').length;
        const saudePct = total > 0 ? Math.round((livre / total) * 100) : 0;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'CTOs Totais',    value: total,    color: '',                                  border: 'border-l-[--color-astrum-fiber]' },
              { label: 'Operacionais',   value: livre,    color: 'text-astrum-signal', border: 'border-l-astrum-signal' },
              { label: 'Em Atenção',     value: atencao,  color: 'text-[--color-astrum-amber]',       border: 'border-l-[--color-astrum-amber]' },
              { label: 'Críticas/Erro',  value: critica,  color: 'text-[--color-astrum-red]',         border: 'border-l-[--color-astrum-red]' },
            ].map(({ label, value, color, border }) => (
              <div key={label} className={cn('rounded-lg border border-l-4 bg-card px-4 py-3', border)}>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className={cn('text-2xl font-bold font-mono tabular-nums mt-0.5', color)}>{value}</p>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border border-border shadow-1 h-[600px] flex flex-col bg-card rounded-stable-xl overflow-hidden">
          <CardHeader className="border-b border-border flex flex-row items-center justify-between">
            <div>
              <CardTitle>Visualização da Rede</CardTitle>
              <CardDescription>Mapa interativo de CTOs e cobertura.</CardDescription>
            </div>
            <div className="flex gap-1 bg-secondary/60 border border-border p-1 rounded-full">
              <Button 
                variant={mapFilter === 'all' ? 'default' : 'ghost'} 
                size="sm" 
                className="text-[10px] h-7 px-3 rounded-full"
                onClick={() => setMapFilter('all')}
              >
                Todas
              </Button>
              <Button 
                variant={mapFilter === 'available' ? 'default' : 'ghost'} 
                size="sm" 
                className="text-[10px] h-7 px-3 rounded-full"
                onClick={() => setMapFilter('available')}
              >
                Disponíveis
              </Button>
              <Button 
                variant={mapFilter === 'full' ? 'default' : 'ghost'} 
                size="sm" 
                className="text-[10px] h-7 px-3 rounded-full"
                onClick={() => setMapFilter('full')}
              >
                Lotadas
              </Button>
            </div>
          </CardHeader>
          <div className="flex-1 relative bg-background overflow-hidden">
            {/* Background overlay */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
            </div>

            <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
              <div className="flex bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1 shadow-sm">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMapZoom(prev => Math.min(prev * 1.2, 5))}>
                  <Plus size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMapZoom(prev => Math.max(prev * 0.8, 0.5))}>
                  <Minus size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetMap}>
                  <RefreshCw size={14} />
                </Button>
              </div>
              <Button 
                variant={isHeatmapVisible ? "default" : "outline"} 
                size="sm" 
                className="h-8 gap-2 bg-card/90 backdrop-blur-sm"
                onClick={() => setIsHeatmapVisible(!isHeatmapVisible)}
              >
                <Layers size={14} /> Heatmap
              </Button>
              <Button 
                variant={isOSLayerVisible ? "default" : "outline"} 
                size="sm" 
                className="h-8 gap-2 bg-card/90 backdrop-blur-sm"
                onClick={() => setIsOSLayerVisible(!isOSLayerVisible)}
              >
                <Layers size={14} /> OSs do Dia
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-2 bg-card/90 backdrop-blur-sm">
                <MapIcon size={14} /> Satélite
              </Button>
            </div>

            {/* Simple SVG Map Grid */}
            <svg 
              className="w-full h-full relative z-10 cursor-grab active:cursor-grabbing" 
              viewBox="0 0 800 600"
              onMouseDown={(e) => {
                handleMouseDown(e);
                setActiveOSPopup(null);
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <defs>
                <pattern id="grid" width={40 * mapZoom} height={40 * mapZoom} patternUnits="userSpaceOnUse">
                  <path d={`M ${40 * mapZoom} 0 L 0 0 0 ${40 * mapZoom}`} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1"/>
                </pattern>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <filter id="heatmap-blur">
                  <feGaussianBlur stdDeviation="15" />
                </filter>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              <g transform={`translate(${mapOffset.x}, ${mapOffset.y}) scale(${mapZoom})`}>
                {/* Heatmap Layer */}
                {isHeatmapVisible && ctos.map((cto: any) => {
                  const x = projX(cto.longitude);
                  const y = projY(cto.latitude);
                  const occupation = occ(cto);
                  let color = "#00C2A8";
                  if (occupation >= 1) color = "#E5484D";
                  else if (occupation >= 0.8) color = "#F0713C";
                  else if (occupation >= 0.5) color = "#F5A524";

                  return (
                    <circle 
                      key={`heatmap-${cto.id}`}
                      cx={x} cy={y} r="40"
                      fill={color}
                      fillOpacity="0.3"
                      filter="url(#heatmap-blur)"
                    />
                  );
                })}
                
                {/* Render CTOs on Map */}
                <TooltipProvider delayDuration={0}>
                  {ctos.filter((cto: any) => {
                    if (mapFilter === 'all') return true;
                    const isFull = usedP(cto) >= totalP(cto);
                    return mapFilter === 'full' ? isFull : !isFull;
                  }).map((cto: any, i: number) => {
                    // Map lat/lng to x/y (projeção Rio)
                    const x = projX(cto.longitude);
                    const y = projY(cto.latitude);
                    const occupation = occ(cto);
                    
                    // Heatmap color logic
                    let colorClass = "fill-astrum-signal";
                    let strokeClass = "stroke-astrum-signal";
                    if (occupation >= 1) { colorClass = "fill-astrum-red"; strokeClass = "stroke-astrum-red"; }
                    else if (occupation >= 0.8) { colorClass = "fill-astrum-orange"; strokeClass = "stroke-astrum-orange"; }
                    else if (occupation >= 0.5) { colorClass = "fill-yellow-400"; strokeClass = "stroke-yellow-400"; }
                    
                    return (
                      <UITooltip key={cto.id}>
                        <TooltipTrigger asChild>
                          <g 
                            className="cursor-pointer group"
                            onClick={(e) => { 
                              e.stopPropagation();
                              setSelectedCTO(cto); 
                              setIsCTODetailOpen(true); 
                            }}
                          >
                            {/* Connection Lines (Simulated) */}
                            {i > 0 && i % 3 === 0 && (
                              <line 
                                x1={x} y1={y} 
                                x2={projX(ctos[i-1].longitude)}
                                y2={projY(ctos[i-1].latitude)}
                                className="stroke-border stroke-[0.5] stroke-dasharray-[4,4]"
                              />
                            )}

                            <circle 
                              cx={x} 
                              cy={y} 
                              r={6 / mapZoom} 
                              className={cn(
                                "transition-all duration-300",
                                colorClass,
                                "group-hover:r-10",
                                cto.status === 'error' && "animate-pulse"
                              )}
                              filter="url(#glow)"
                            />
                            {cto.status === 'error' && (
                              <circle 
                                cx={x} 
                                cy={y} 
                                r={15 / mapZoom} 
                                className="animate-ping opacity-30 fill-none stroke-astrum-red stroke-2"
                              />
                            )}
                            <circle 
                              cx={x} 
                              cy={y} 
                              r={12 / mapZoom} 
                              className={cn(
                                "animate-ping opacity-20 fill-none stroke-2",
                                strokeClass
                              )}
                            />
                            
                            {/* Techy Ring */}
                            <circle 
                              cx={x} 
                              cy={y} 
                              r={10 / mapZoom} 
                              className={cn(
                                "opacity-0 group-hover:opacity-40 fill-none stroke-[1] stroke-dasharray-[2,2] animate-[spin_4s_linear_infinite]",
                                strokeClass
                              )}
                            />
                          </g>
                        </TooltipTrigger>
                        <TooltipContent className="bg-card text-white border-border p-3 rounded-xl shadow-xl z-50">
                          <div className="space-y-2 min-w-[180px]">
                            <div className="flex items-center gap-2 border-b border-border pb-2 mb-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full", 
                                occupation >= 1 ? "bg-astrum-red" : 
                                occupation >= 0.8 ? "bg-astrum-orange" : "bg-astrum-signal"
                              )} />
                              <p className="font-bold text-sm">{cto.name}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                              <span className="text-muted-foreground uppercase font-bold">Ocupação</span>
                              <span className="text-right font-mono">{usedP(cto)} / {totalP(cto)} ({Math.round(occupation * 100)}%)</span>
                              
                              <span className="text-muted-foreground uppercase font-bold">Status</span>
                              <span className={cn("text-right font-bold uppercase", 
                                cto.status === 'active' ? "text-astrum-signal" : 
                                cto.status === 'full' ? "text-astrum-red" : "text-astrum-orange"
                              )}>
                                {cto.status === 'active' ? 'Operacional' : cto.status === 'full' ? 'Lotada' : 'Manutenção'}
                              </span>
                              
                              <span className="text-muted-foreground uppercase font-bold">Coordenadas</span>
                              <span className="text-right font-mono text-muted-foreground">{cto.latitude.toFixed(4)}, {cto.longitude.toFixed(4)}</span>
                            </div>
                            <div className="pt-2 border-t border-border mt-2">
                              <p className="text-[9px] text-muted-foreground italic text-center">Clique para detalhes técnicos</p>
                            </div>
                          </div>
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </TooltipProvider>

                {/* OS Layer */}
                {isOSLayerVisible && (
                  <TooltipProvider delayDuration={0}>
                    {liveOSS.map((os) => {
                      const x = projX(os.lng);
                      const y = projY(os.lat);
                      
                      let colorClass = "fill-yellow-400";
                      let strokeClass = "stroke-yellow-500";
                      
                      if (os.status === 'in_progress') {
                        colorClass = "fill-astrum-fiber";
                        strokeClass = "stroke-astrum-fiber";
                      } else if (os.status === 'completed') {
                        colorClass = "fill-astrum-signal";
                        strokeClass = "stroke-astrum-signal";
                      } else if (os.status === 'delayed') {
                        colorClass = "fill-astrum-red";
                        strokeClass = "stroke-astrum-red";
                      }

                      return (
                        <UITooltip key={os.id} open={activeOSPopup === os.id} onOpenChange={(open) => {
                          if (!open && activeOSPopup === os.id) setActiveOSPopup(null);
                        }}>
                          <TooltipTrigger asChild>
                            <g 
                              className="cursor-pointer group"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveOSPopup(activeOSPopup === os.id ? null : os.id);
                              }}
                            >
                              <path 
                                d={`M ${x},${y} m 0,-15 l 10,-15 a 12,12 0 1,0 -20,0 z`} 
                                className={cn(
                                  "transition-all duration-300", 
                                  colorClass, strokeClass,
                                  "stroke-[1.5]"
                                )}
                              />
                              <circle cx={x} cy={y-22} r="4" fill="white" />
                            </g>
                          </TooltipTrigger>
                          <TooltipContent className="bg-card text-white border-border p-3 rounded-xl shadow-xl z-50">
                            <div className="space-y-2 min-w-[200px]">
                              <div className="flex items-center gap-2 border-b border-border pb-2 mb-2">
                                <div className={cn("w-2 h-2 rounded-full", colorClass.replace('fill-', 'bg-'))} />
                                <p className="font-bold text-sm">{os.id}</p>
                              </div>
                              <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-[10px]">
                                <span className="text-muted-foreground font-bold uppercase">Cliente</span>
                                <span>{os.client}</span>
                                
                                <span className="text-muted-foreground font-bold uppercase">Técnico</span>
                                <span>{os.tech}</span>
                                
                                <span className="text-muted-foreground font-bold uppercase">Tipo</span>
                                <span>{os.type}</span>
                                
                                <span className="text-muted-foreground font-bold uppercase">Status</span>
                                <span className={cn(
                                  "uppercase font-bold",
                                  os.status === 'pending' ? 'text-yellow-400' :
                                  os.status === 'in_progress' ? 'text-astrum-fiber' :
                                  os.status === 'completed' ? 'text-astrum-signal' : 'text-astrum-red'
                                )}>
                                  {os.status === 'pending' ? 'Pendente' : 
                                   os.status === 'in_progress' ? 'Em Execução' :
                                   os.status === 'completed' ? 'Concluída' : 'Atrasada'}
                                </span>
                              </div>
                            </div>
                          </TooltipContent>
                        </UITooltip>
                      );
                    })}
                  </TooltipProvider>
                )}
              </g>
            </svg>
            
            <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm p-3 rounded-xl border border-border shadow-sm space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Ocupação (Heatmap)</p>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-astrum-signal" />
                <span className="text-foreground/80">Livre (0% - 49%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="text-foreground/80">Atenção (50% - 79%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-astrum-orange" />
                <span className="text-foreground/80">Crítico (80% - 99%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-astrum-red" />
                <span className="text-foreground/80">Lotada (100%)</span>
              </div>
            </div>

            {isOSLayerVisible && (
              <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur-sm p-3 rounded-xl border border-border shadow-sm space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Status OS</p>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="text-foreground/80">Pendente</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-astrum-fiber" />
                  <span className="text-foreground/80">Em Execução</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-astrum-signal" />
                  <span className="text-foreground/80">Concluída</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-astrum-red" />
                  <span className="text-foreground/80">Atrasada</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="border-none shadow-sm flex flex-col h-[600px]">
          <CardHeader>
            <CardTitle>Lista de CTOs</CardTitle>
            <CardDescription>Status das caixas de atendimento.</CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {ctos.length > 0 ? ctos.map((cto: any) => {
                const occupation = occ(cto);
                let colorClass = "bg-astrum-signal";
                if (occupation >= 1) colorClass = "bg-astrum-red";
                else if (occupation >= 0.8) colorClass = "bg-astrum-orange";
                else if (occupation >= 0.5) colorClass = "bg-yellow-400";

                return (
                  <div key={cto.id} className="p-3 rounded-xl border border-border bg-secondary/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{cto.name}</span>
                      <Badge variant={occupation >= 1 ? 'destructive' : 'outline'} className="text-[10px]">
                        {usedP(cto)}/{totalP(cto)} Portas
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Lat: {cto.latitude?.toFixed(4)}</span>
                      <span>Lng: {cto.longitude?.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-500", colorClass)} 
                        style={{ width: `${occupation * 100}%` }} 
                      />
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-10 text-muted-foreground text-sm italic">
                  Nenhuma CTO cadastrada.
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>

      
      
    </motion.div>
  );
}
