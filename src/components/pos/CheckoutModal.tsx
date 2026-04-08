import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PaymentLine, PaymentMethod, PriceTerm } from "@/lib/pos-store";
import { Plus, Trash2 } from "lucide-react";

const BASE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

const TARJETA_METHODS_MAP: Record<string, { value: PaymentMethod; label: string }[]> = {
  DEBITO: [{ value: "TARJETA", label: "Tarjeta - Débito" }],
  CREDITO_1: [{ value: "TARJETA", label: "Tarjeta - Crédito 1" }],
  CREDITO_3: [{ value: "TARJETA", label: "Tarjeta - Crédito 3" }],
};

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
  priceTerm?: PriceTerm;
  isClosingTab?: boolean;
}

export function CheckoutModal({
  open, onOpenChange, total, subtotalLocal, subtotalRestaurant, deliveryFee, onConfirm, loading, initialPaymentMethod = "EFECTIVO", priceTerm = "BASE", isClosingTab = false,
}: Props) {
  const [lines, setLines] = useState<{ method: PaymentMethod; amount: string }[]>([
    { method: "EFECTIVO", amount: "" },
  ]);

  const updateLine = (i: number, field: "method" | "amount", val: string) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  };

  const addLine = () => {
    if (lines.length < 2) setLines([...lines, { method: "QR", amount: "" }]);
  };

  const removeLine = (i: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  const parsedAmounts = lines.map((l) => parseInt(l.amount) || 0);
  const totalPaid = parsedAmounts.reduce((a, b) => a + b, 0);
  const diff = totalPaid - total;
  const hasEfectivo = lines.some((l) => l.method === "EFECTIVO");
  const isValid = totalPaid >= total && lines.every((l) => (parseInt(l.amount) || 0) > 0);
  const isTarjeta = initialPaymentMethod === "TARJETA";
  const availableMethods = isTarjeta ? (TARJETA_METHODS_MAP[priceTerm] || TARJETA_METHODS_MAP["CREDITO_1"]) : BASE_METHODS;

  const handleConfirm = () => {
    const payments: PaymentLine[] = lines.map((l) => ({
      payment_method: l.method,
      amount: parseInt(l.amount) || 0,
    }));
    onConfirm(payments);
  };

  // Reset on open
  useEffect(() => {
    if (open) {
      setLines([{ method: initialPaymentMethod, amount: String(total) }]);
    }
  }, [open, initialPaymentMethod, total]);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isClosingTab ? "Cerrar y cobrar cuenta" : "Cobrar venta"}</DialogTitle>
          <DialogDescription>Total a cobrar: ${total.toLocaleString("es-AR")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Lo mío (Local + envío)</span>
            <span>${(subtotalLocal + deliveryFee).toLocaleString("es-AR")}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Restaurante</span>
            <span>${subtotalRestaurant.toLocaleString("es-AR")}</span>
          </div>
          <div className="flex justify-between font-semibold text-lg border-t pt-2">
            <span>Total</span>
            <span>${total.toLocaleString("es-AR")}</span>
          </div>
        </div>

        <div className="space-y-3 mt-2">
          <Label>Métodos de pago</Label>
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Select value={line.method} onValueChange={(v) => updateLine(i, "method", v)} disabled={isTarjeta}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableMethods.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Monto"
                value={line.amount}
                onChange={(e) => updateLine(i, "amount", e.target.value)}
                className="flex-1"
              />
              {lines.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {lines.length < 2 && (
            <Button variant="outline" size="sm" onClick={addLine} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Agregar método
            </Button>
          )}
        </div>

        {diff > 0 && hasEfectivo && (
          <div className="bg-muted rounded-md p-3 text-sm font-medium">
            Vuelto: ${diff.toLocaleString("es-AR")}
          </div>
        )}
        {totalPaid > 0 && totalPaid < total && (
          <p className="text-sm text-destructive">
            Faltan ${(total - totalPaid).toLocaleString("es-AR")}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || loading}>
            {loading ? "Procesando..." : isClosingTab ? "Cerrar y cobrar" : "Confirmar venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
