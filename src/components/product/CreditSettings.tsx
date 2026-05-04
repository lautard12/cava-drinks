import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Save, RefreshCw, ExternalLink } from "lucide-react";
import { recalculateAllPrices, findAnchor } from "@/lib/price-store";
import {
  fetchPriceTerms, updatePriceTerm, type PriceTerm,
} from "@/lib/config-store";
import { Link } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreditSettings({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [localTerms, setLocalTerms] = useState<(PriceTerm & { _dirty?: boolean })[]>([]);

  const { data: terms = [] } = useQuery<PriceTerm[]>({
    queryKey: ["price-terms"],
    queryFn: fetchPriceTerms,
  });
  const anchor = findAnchor(terms);

  const [lastSynced, setLastSynced] = useState<string>("");
  const termsKey = terms.map((t) => t.id).join(",");
  if (termsKey !== lastSynced && terms.length > 0) {
    setLocalTerms(terms.map((t) => ({ ...t })));
    setLastSynced(termsKey);
  }

  const updateLocal = (id: string, value: string) => {
    setLocalTerms((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, surcharge_pct: parseFloat(value) || 0, _dirty: true } : t,
      ),
    );
  };

  const handleSaveAll = async () => {
    const dirty = localTerms.filter((t) => t._dirty);
    if (dirty.length === 0) {
      toast({ title: "Sin cambios" });
      return;
    }
    // Validación: el ancla no puede tener recargo distinto de 0.
    const dirtyAnchor = dirty.find((t) => t.id === anchor?.id);
    if (dirtyAnchor && dirtyAnchor.surcharge_pct !== 0) {
      toast({ title: "El ancla siempre tiene recargo 0%", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      for (const t of dirty) {
        await updatePriceTerm(t.id, { surcharge_pct: t.surcharge_pct });
      }
      queryClient.invalidateQueries({ queryKey: ["price-terms"] });
      queryClient.invalidateQueries({ queryKey: ["cfg-price-terms"] });
      toast({ title: "Porcentajes actualizados" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await recalculateAllPrices();
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      toast({ title: "Todos los precios recalculados" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const hasDirty = localTerms.some((t) => t._dirty);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recargos rápidos</DialogTitle>
          <DialogDescription>
            Ajustá los porcentajes. Para crear/eliminar términos andá a{" "}
            <Link
              to="/configuracion"
              className="underline inline-flex items-center gap-1"
              onClick={() => onOpenChange(false)}
            >
              Configuración → Precios y Cobros
              <ExternalLink className="h-3 w-3" />
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {localTerms.map((t) => {
            const isAnchor = anchor?.id === t.id;
            return (
              <div key={t.id} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-2">
                    {t.label}
                    {isAnchor && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                        ANCLA
                      </Badge>
                    )}
                  </Label>
                  <Input value={t.label} disabled className="h-9" />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs text-muted-foreground">%</Label>
                  <Input
                    type="number"
                    min="0"
                    value={t.surcharge_pct}
                    disabled={isAnchor}
                    onChange={(e) => updateLocal(t.id, e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            );
          })}
          {localTerms.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay términos configurados.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {hasDirty && (
            <Button onClick={handleSaveAll} disabled={saving} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleRecalculate}
            disabled={recalculating || !anchor}
            className="w-full"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recalculando..." : "Recalcular todos los productos"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
