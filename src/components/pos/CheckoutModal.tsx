import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PaymentLine, PaymentMethod } from "@/lib/pos-store";
import type { PriceTerm } from "@/lib/config-store";
import { Plus, Trash2 } from "lucide-react";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "QR", label: "QR" },
  { value: "TARJETA", label: "Tarjeta" },
];

interface PaymentLineDraft {
  method: PaymentMethod;
  amount: string;
  priceTerm: string; // code de price_terms
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  subtotalLocal: number;
  subtotalRestaurant: number;
  deliveryFee: number;
  onConfirm: (payments: PaymentLine[]) => void;
  loading: boolean;
  initialPaymentMethod?: PaymentMethod;
  priceTerm?: string;
  priceTerms?: PriceTerm[];
  isClosingTab?: boolean;
}

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

function getFund(method: PaymentMethod): "EFECTIVO" | "MERCADOPAGO" {
  return method === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
}

function getSurchargePct(termCode: string, terms: PriceTerm[]): number {
  return terms.find((t) => t.code === termCode)?.surcharge_pct ?? 0;
}

export function CheckoutModal({
  open,
  onOpenChange,
  total,
  subtotalLocal,
  subtotalRestaurant,
  deliveryFee,
  onConfirm,
  loading,
  initialPaymentMethod = "EFECTIVO",
  priceTerm,
  priceTerms = [],
  isClosingTab = false,
}: Props) {
  // El ancla (sort_order=0, surcharge_pct=0) es el default cuando no nos pasan priceTerm.
  const anchorTerm = useMemo(
    () => priceTerms.find((t) => t.sort_order === 0 && t.surcharge_pct === 0) ?? null,
    [priceTerms],
  );
  const defaultTermCode = priceTerm || anchorTerm?.code || "";

  const [lines, setLines] = useState<PaymentLineDraft[]>([
    { method: "EFECTIVO", amount: "", priceTerm: defaultTermCode },
  ]);

  // Reset al abrir: una línea con el monto total y el price_term de la venta.
  useEffect(() => {
    if (open) {
      setLines([{ method: initialPaymentMethod, amount: String(total), priceTerm: defaultTermCode }]);
    }
  }, [open, initialPaymentMethod, total, defaultTermCode]);

  const updateLine = (i: number, patch: Partial<PaymentLineDraft>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { method: "EFECTIVO", amount: "", priceTerm: anchorTerm?.code ?? defaultTermCode }]);
  };

  const removeLine = (i: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Cálculos por línea
  const computedLines = useMemo(() => {
    return lines.map((l) => {
      const amount = parseInt(l.amount) || 0;
      const pct = getSurchargePct(l.priceTerm, priceTerms);
      const commission = pct > 0 ? Math.round((amount * pct) / (100 + pct)) : 0;
      return {
        ...l,
        amount,
        pct,
        commission,
        net: amount - commission,
        fund: getFund(l.method),
      };
    });
  }, [lines, priceTerms]);

  const totalPaid = computedLines.reduce((s, l) => s + l.amount, 0);
  const totalCommission = computedLines.reduce((s, l) => s + l.commission, 0);
  const totalNet = totalPaid - totalCommission;
  const diff = totalPaid - total;
  const hasEfectivo = computedLines.some((l) => l.method === "EFECTIVO");
  const allLinesPositive = computedLines.every((l) => l.amount > 0);
  // Permitimos diff > 0 sólo si hay efectivo (vuelto). Sin efectivo, debe ser exacto.
  const isValid = allLinesPositive && (
    diff === 0 || (diff > 0 && hasEfectivo)
  );

  const handleConfirm = () => {
    const payments: PaymentLine[] = computedLines.map((l) => ({
      payment_method: l.method,
      amount: l.amount,
      price_term: l.priceTerm,
      surcharge_pct: l.pct,
    }));
    onConfirm(payments);
  };

  // Opciones de price_term para cada línea (todas las activas, ordenadas).
  const termOptions = useMemo(
    () =>
      priceTerms.map((t) => ({
        value: t.code,
        label: t.surcharge_pct === 0 ? t.label : `${t.label} (+${t.surcharge_pct}%)`,
      })),
    [priceTerms],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isClosingTab ? "Cerrar y cobrar cuenta" : "Cobrar venta"}</DialogTitle>
          <DialogDescription>Total a cobrar: {fmt(total)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Lo mío (Local + envío)</span>
            <span>{fmt(subtotalLocal + deliveryFee)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Restaurante</span>
            <span>{fmt(subtotalRestaurant)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base border-t pt-2">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>

        <div className="space-y-3 mt-2">
          <div className="flex items-center justify-between">
            <Label>Pagos</Label>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar línea
            </Button>
          </div>

          {computedLines.map((line, i) => (
            <div key={i} className="rounded-md border p-2 space-y-2 bg-muted/20">
              <div className="flex gap-2 items-center">
                <Select value={line.method} onValueChange={(v) => updateLine(i, { method: v as PaymentMethod })}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={line.priceTerm} onValueChange={(v) => updateLine(i, { priceTerm: v })}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {termOptions.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Monto"
                  value={line.amount}
                  onChange={(e) => updateLine(i, { amount: e.target.value })}
                  className="flex-1"
                />
                {lines.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground px-1">
                <span>Fondo: <strong className="text-foreground">{line.fund}</strong></span>
                {line.commission > 0 ? (
                  <span>Comisión: <strong className="text-destructive">−{fmt(line.commission)}</strong> · Neto: {fmt(line.net)}</span>
                ) : (
                  <span>Sin comisión</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border p-3 mt-2 space-y-1 text-sm bg-muted/30">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total cobrado (bruto)</span>
            <span className="font-medium">{fmt(totalPaid)}</span>
          </div>
          {totalCommission > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total comisiones</span>
              <span className="text-destructive font-medium">−{fmt(totalCommission)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1">
            <span className="font-semibold">Neto a recibir</span>
            <span className="font-bold">{fmt(totalNet)}</span>
          </div>
          {diff > 0 && hasEfectivo && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400 border-t pt-1">
              <span className="font-semibold">Vuelto</span>
              <span className="font-bold">{fmt(diff)}</span>
            </div>
          )}
          {diff < 0 && (
            <div className="flex justify-between text-destructive border-t pt-1">
              <span className="font-semibold">Faltan</span>
              <span className="font-bold">{fmt(-diff)}</span>
            </div>
          )}
          {diff > 0 && !hasEfectivo && (
            <p className="text-xs text-destructive">El total cobrado supera al total a cobrar y no hay efectivo para dar vuelto.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || loading}>
            {loading ? "Procesando…" : isClosingTab ? "Cerrar y cobrar" : "Confirmar venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
