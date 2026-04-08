import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (tabName: string) => void;
  loading: boolean;
}

export function NewTabDialog({ open, onOpenChange, onConfirm, loading }: Props) {
  const [name, setName] = useState("");

  const handleConfirm = () => {
    onConfirm(name.trim());
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva cuenta</DialogTitle>
          <DialogDescription>Asigná un nombre o alias a la cuenta (opcional)</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="tab-name">Nombre / Mesa</Label>
          <Input
            id="tab-name"
            placeholder="Ej: Mesa 1, Juan, etc."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Creando..." : "Crear cuenta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
