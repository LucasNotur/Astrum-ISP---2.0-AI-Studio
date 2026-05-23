import React, { useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";

interface SignaturePadProps {
  onConfirm: (base64Png: string) => void;
  onClear?: () => void;
  className?: string;
}

export function SignaturePad({ onConfirm, onClear, className = "" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    // Resize canvas to fit container
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas && container) {
      canvas.width = container.clientWidth;
      // Fixed height or aspect ratio can be used, we'll keep 150px default
      canvas.height = 150; 
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "white"; // white background for the PNG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const getCoordinates = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDrawing = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "black";
    setIsDrawing(true);
  };

  const draw = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.closePath();
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (onClear) onClear();
  };

  const handleConfirm = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      onConfirm(dataUrl);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div 
        ref={containerRef} 
        className="w-full border rounded-md overflow-hidden bg-white touch-none"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-[150px] cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <div className="flex justify-between items-center gap-2">
        <Button variant="outline" size="sm" onClick={clearCanvas} type="button">
          Limpar
        </Button>
        <Button size="sm" onClick={handleConfirm} type="button">
          Confirmar Assinatura
        </Button>
      </div>
    </div>
  );
}
