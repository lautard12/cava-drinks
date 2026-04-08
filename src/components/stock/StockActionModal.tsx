import { useState } from "react";
import { ProductWithStock, MovementType } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StockActionModalProps {
  product: ProductWithStock | null;
  action: 'PURCHASE' | 'WASTE' | 'ADJUST' | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (productId: string, type: MovementType, qty: number, reason: string) => Promise<{ error?: string; success?: boolean }> | { error?: string; success?: boolean };
}

const actionLabels: Record<string, { title: string; qtyLabel: string }> = {
  PURCHASE: { title: 'Registrar Compra', qtyLabel: 'Cantidad comprada' },
  WASTE: { title: 'Registrar Rotura', qtyLabel: 'Cantidad perdida' },
  ADJUST: { title: 'Ajustar Stock', qtyLabel: 'Nueva cantidad total' },
};

export function StockActionModal({ product, action, open, onClose, onSubmit }: StockActionModalProps) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!product || !action) return null;
  const config = actionLabels[action];

  const handleSubmit = async () => {
    const numQty = parseInt(qty, 10);
    if (isNaN(numQty) || numQty <= 0) {
      setError('Ingresá una cantidad válida mayor a 0');
      return;
    }

    let finalQty = numQty;
    if (action === 'ADJUST') {
      finalQty = numQty - product.qty_on_hand;
    }

    const result = await onSubmit(product.id, action === 'ADJUST' ? 'ADJUST' : action, action === 'ADJUST' ? finalQty : numQty, reason || config.title);
    if (result.error) {
      setError(result.error);
    } else {
      setQty('');
      setReason('');
      setError('');
      onClose();
    }
  };

  const handleClose = () => {
    setQty('');
    setReason('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {product.name} {product.variant_label} — Stock actual: <span className="font-semibold text-foreground">{product.qty_on_hand}</span>
          </p>
          <div className="space-y-2">
            <Label>{config.qtyLabel}</Label>
            <Input
              type="number"
              min="0"
              value={qty}
              onChange={(e) => { setQty(e.target.value); setError(''); }}
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Razón (opcional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo del movimiento"
            />
          </div>
          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
