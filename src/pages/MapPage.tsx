import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Minus, 
  RefreshCw, 
  Layers, 
  Map as MapIcon, 
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { cn } from '@/src/lib/utils';
import { useAppStore } from '@/src/store/useAppStore';

export function MapPage() {
  const { ctos, setSelectedCTO, setIsCTODetailOpen } = useAppStore();
  // We use store for cto list now. So we must set the internal state properly.

  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mapFilter, setMapFilter] = useState('all');
  const [isHeatmapVisible, setIsHeatmapVisible] = useState(false);
      
  
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
      <header className="flex items-center justify-between">
        
        <Button className="gap-2">
          <Plus size={18} /> Nova CTO
        </Button>
      </header>
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-none shadow-sm h-[600px] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden">
          <CardHeader className="border-b dark:border-zinc-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle>Visualização da Rede</CardTitle>
              <CardDescription>Mapa interativo de CTOs e cobertura.</CardDescription>
            </div>
            <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
              <Button 
                variant={mapFilter === 'all' ? 'default' : 'ghost'} 
                size="sm" 
                className="text-[10px] h-7 px-3 rounded-md"
                onClick={() => setMapFilter('all')}
              >
                Todas
              </Button>
              <Button 
                variant={mapFilter === 'available' ? 'default' : 'ghost'} 
                size="sm" 
                className="text-[10px] h-7 px-3 rounded-md"
                onClick={() => setMapFilter('available')}
              >
                Disponíveis
              </Button>
              <Button 
                variant={mapFilter === 'full' ? 'default' : 'ghost'} 
                size="sm" 
                className="text-[10px] h-7 px-3 rounded-md"
                onClick={() => setMapFilter('full')}
              >
                Lotadas
              </Button>
            </div>
          </CardHeader>
          <div className="flex-1 relative bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
            {/* Techy Background Overlay */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
              <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            </div>

            <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
              <div className="flex bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 shadow-sm">
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
                className="h-8 gap-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm"
                onClick={() => setIsHeatmapVisible(!isHeatmapVisible)}
              >
                <Layers size={14} /> Heatmap
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm">
                <MapIcon size={14} /> Satélite
              </Button>
            </div>

            {/* Simple SVG Map Grid */}
            <svg 
              className="w-full h-full relative z-10 cursor-grab active:cursor-grabbing" 
              viewBox="0 0 800 600"
              onMouseDown={handleMouseDown}
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
                  const x = 400 + (cto.longitude - (-46.6333)) * 5000;
                  const y = 300 - (cto.latitude - (-23.5505)) * 5000;
                  const occupation = cto.usedPorts / cto.totalPorts;
                  let color = "#22c55e";
                  if (occupation >= 1) color = "#dc2626";
                  else if (occupation >= 0.8) color = "#f97316";
                  else if (occupation >= 0.5) color = "#facc15";

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
                    const isFull = cto.usedPorts >= cto.totalPorts;
                    return mapFilter === 'full' ? isFull : !isFull;
                  }).map((cto: any, i: number) => {
                    // Map lat/lng to x/y (simulated)
                    const x = 400 + (cto.longitude - (-46.6333)) * 5000;
                    const y = 300 - (cto.latitude - (-23.5505)) * 5000;
                    const occupation = cto.usedPorts / cto.totalPorts;
                    
                    // Heatmap color logic
                    let colorClass = "fill-green-500";
                    let strokeClass = "stroke-green-500";
                    if (occupation >= 1) { colorClass = "fill-red-600"; strokeClass = "stroke-red-600"; }
                    else if (occupation >= 0.8) { colorClass = "fill-orange-500"; strokeClass = "stroke-orange-500"; }
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
                                x2={400 + (ctos[i-1].longitude - (-46.6333)) * 5000} 
                                y2={300 - (ctos[i-1].latitude - (-23.5505)) * 5000} 
                                className="stroke-zinc-200 dark:stroke-zinc-800 stroke-[0.5] stroke-dasharray-[4,4]"
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
                                className="animate-ping opacity-30 fill-none stroke-red-500 stroke-2"
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
                        <TooltipContent className="bg-zinc-900 text-white border-zinc-800 p-3 rounded-xl shadow-xl z-50">
                          <div className="space-y-2 min-w-[180px]">
                            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 mb-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full", 
                                occupation >= 1 ? "bg-red-500" : 
                                occupation >= 0.8 ? "bg-orange-500" : "bg-green-500"
                              )} />
                              <p className="font-bold text-sm">{cto.name}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                              <span className="text-zinc-400 uppercase font-bold">Ocupação</span>
                              <span className="text-right font-mono">{cto.usedPorts} / {cto.totalPorts} ({Math.round(occupation * 100)}%)</span>
                              
                              <span className="text-zinc-400 uppercase font-bold">Status</span>
                              <span className={cn("text-right font-bold uppercase", 
                                cto.status === 'active' ? "text-green-400" : 
                                cto.status === 'full' ? "text-red-400" : "text-orange-400"
                              )}>
                                {cto.status === 'active' ? 'Operacional' : cto.status === 'full' ? 'Lotada' : 'Manutenção'}
                              </span>
                              
                              <span className="text-zinc-400 uppercase font-bold">Coordenadas</span>
                              <span className="text-right font-mono text-zinc-500">{cto.latitude.toFixed(4)}, {cto.longitude.toFixed(4)}</span>
                            </div>
                            <div className="pt-2 border-t border-zinc-800 mt-2">
                              <p className="text-[9px] text-zinc-500 italic text-center">Clique para detalhes técnicos</p>
                            </div>
                          </div>
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </TooltipProvider>
              </g>
            </svg>
            
            <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Ocupação (Heatmap)</p>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="dark:text-zinc-300">Livre (0% - 49%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="dark:text-zinc-300">Atenção (50% - 79%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="dark:text-zinc-300">Crítico (80% - 99%)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-red-600" />
                <span className="dark:text-zinc-300">Lotada (100%)</span>
              </div>
            </div>
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
                const occupation = cto.usedPorts / cto.totalPorts;
                let colorClass = "bg-green-500";
                if (occupation >= 1) colorClass = "bg-red-600";
                else if (occupation >= 0.8) colorClass = "bg-orange-500";
                else if (occupation >= 0.5) colorClass = "bg-yellow-400";

                return (
                  <div key={cto.id} className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{cto.name}</span>
                      <Badge variant={occupation >= 1 ? 'destructive' : 'outline'} className="text-[10px]">
                        {cto.usedPorts}/{cto.totalPorts} Portas
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span>Lat: {cto.latitude?.toFixed(4)}</span>
                      <span>Lng: {cto.longitude?.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-500", colorClass)} 
                        style={{ width: `${occupation * 100}%` }} 
                      />
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-10 text-zinc-400 text-sm italic">
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
