import React, { useState, useEffect } from "react";
import { Eye } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { maskCPF, maskPhone, maskEmail } from "../lib/clientMasking";
import { useAppStore } from "../store/useAppStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

type MaskType = "cpf" | "phone" | "email";

export function MaskedSensitiveData({
  value,
  type,
  className,
}: {
  value: string;
  type: MaskType;
  className?: string;
}) {
  const companySettings = useAppStore((s) => s.companySettings);
  const tenantId = companySettings?.tenant_id;

  const [isUnmasked, setIsUnmasked] = useState(false);
  const [unmaskedValue, setUnmaskedValue] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const maskedValue = React.useMemo(() => {
    if (type === "cpf") return maskCPF(value);
    if (type === "phone") return maskPhone(value);
    if (type === "email") return maskEmail(value);
    return "***";
  }, [value, type]);

  useEffect(() => {
    let timer: any;
    if (isUnmasked) {
      timer = setTimeout(() => {
        setIsUnmasked(false);
        setUnmaskedValue("");
      }, 30000);
    }
    return () => clearTimeout(timer);
  }, [isUnmasked]);

  const handleUnmask = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!reason) {
      toast.error("Selecione um motivo obrigatório.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/unmask", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-tenant-id": tenantId || ""
        },
        body: JSON.stringify({ value, reason }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUnmaskedValue(data.value);
        setIsUnmasked(true);
        setIsDialogOpen(false);
      } else {
        throw new Error(data.error || "Acesso negado");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenStatus = (open: boolean) => {
    if (open) {
      setReason("");
    }
    setIsDialogOpen(open);
  };

  if (!value) return <span className={className}>-</span>;

  return (
    <div
      className={`flex items-center gap-2 ${className || ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span>{isUnmasked ? unmaskedValue : maskedValue}</span>
      {!isUnmasked && (
        <Dialog open={isDialogOpen} onOpenChange={handleOpenStatus}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-zinc-400 hover:text-zinc-600 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                setIsDialogOpen(true);
              }}
            >
              <Eye size={12} />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Acesso a Dados Sensíveis</DialogTitle>
              <DialogDescription>
                Por favor, informe o motivo para visualizar este dado. O acesso
                será registrado para auditoria.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um motivo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Atendimento ao cliente">
                    Atendimento ao cliente
                  </SelectItem>
                  <SelectItem value="Suporte técnico">
                    Suporte técnico
                  </SelectItem>
                  <SelectItem value="Auditoria e Conformidade">
                    Auditoria e Conformidade
                  </SelectItem>
                  <SelectItem value="Solicitação do titular">
                    Solicitação do titular
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={isLoading || !reason} onClick={handleUnmask}>
                {isLoading ? "Acessando..." : "Confirmar Acesso"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
