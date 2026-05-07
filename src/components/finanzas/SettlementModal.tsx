import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import type { Fund } from "@/lib/finanzas-store";
import { createSettlement, fetchSuggestedPeriod } from "@/lib/restaurant-settlement-store";

interface SettlementModalProps {
  open: boolean;
  defaultDate: string;
  pendiente: number;
  onClose: () => void;
  onSaved: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

export function SettlementModal({
  open,
  defaultDate,
  pendiente,
  onClose,
  onSaved,
}: SettlementModalProps) {
  const [date, setDate] = useState(defaultDate);
  const [fund, setFund] = useState<Fund>("EFECTIVO");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState(defaultDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(defaultDate);
    setFund("EFECTIVO");
    setAmount("");
    setNotes("");
    setPeriodTo(defaultDate);
    // Sugerir período: desde el día siguiente a la última rendición hasta hoy.
    fetchSuggestedPeriod()
      .then(({ from, to }) => {
        setPeriodFrom(from ?? "");
        setPeriodTo(to);
      })
      .catch(() => {
        setPeriodFrom("");
      });
  }, [open, defaultDate]);

  const parsed = Number(amount.replace(",", "."));
  const validAmount = Number.isFinite(parsed) && parsed > 0;
  const excedePendiente = validAmount && parsed > pendiente;

  const periodInvalid =
    periodFrom !== "" && periodTo !== "" && periodFrom > periodTo;

  const handleSave = async () => {
    if (!validAmount) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (periodInvalid) {
      toast.error("El período es inválido (desde es mayor que hasta)");
      return;
    }
    setSaving(true);
    try {
      await createSettlement({
        date,
        fund,
        amount: Math.round(parsed),
        notes,
        period_from: periodFrom || null,
        period_to: periodTo || null,
      });
      toast.success("Rendición registrada");
      onSaved();
    } catch {
      toast.error("Error al guardar la rendición");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar rendición al restaurante</DialogTitle>
          <DialogDescription>
            Plata que le devolvés al dueño del restaurante. Sale del fondo elegido y se descuenta del pendiente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm flex justify-between">
          <span className="text-muted-foreground">Pendiente actual</span>
          <span className="font-semibold tabular-nums">{fmt(pendiente)}</span>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Fondo de salida</Label>
            <Select value={fund} onValueChange={(v) => setFund(v as Fund)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                <SelectItem value="MERCADOPAGO">MercadoPago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Período cubierto</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                placeholder="Desde"
              />
              <Input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                placeholder="Hasta"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              El recibo va a mostrar el detalle de las ventas en este rango.
            </p>
            {periodInvalid && (
              <p className="text-xs text-destructive mt-1">"Desde" no puede ser mayor que "hasta".</p>
            )}
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {excedePendiente && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                El monto supera el pendiente actual ({fmt(pendiente)}).
              </p>
            )}
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ej: rendición semana del 1 al 7 de mayo"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !validAmount || periodInvalid}>
            {saving ? "Guardando…" : "Registrar rendición"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
