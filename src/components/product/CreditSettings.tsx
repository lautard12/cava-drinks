import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, RefreshCw } from "lucide-react";
import {
  fetchSurchargeTiers, addSurchargeTier, updateSurchargeTier, deleteSurchargeTier,
  recalculateAllPrices, ensureAllProductsHaveTier,
  type SurchargeTier,
} from "@/lib/price-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreditSettings({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Editable local state
  const [localTiers, setLocalTiers] = useState<(SurchargeTier & { _dirty?: boolean })[]>([]);
  const [newName, setNewName] = useState("");
  const [newPct, setNewPct] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: tiers = [] } = useQuery<SurchargeTier[]>({
    queryKey: ["surcharge-tiers"],
    queryFn: fetchSurchargeTiers,
  });

  // Sync from server when tiers change
  const [lastSynced, setLastSynced] = useState<string>("");
  const tiersKey = tiers.map(t => t.id).join(",");
  if (tiersKey !== lastSynced && tiers.length > 0) {
    setLocalTiers(tiers.map(t => ({ ...t })));
    setLastSynced(tiersKey);
  }

  const updateLocal = (id: string, field: "name" | "percentage", value: string) => {
    setLocalTiers(prev => prev.map(t =>
      t.id === id
        ? { ...t, [field]: field === "percentage" ? parseFloat(value) || 0 : value, _dirty: true }
        : t
    ));
  };

  const handleSaveAll = async () => {
    const dirty = localTiers.filter(t => t._dirty);
    if (dirty.length === 0) {
      toast({ title: "Sin cambios" });
      return;
    }
    setSaving(true);
    try {
      for (const t of dirty) {
        await updateSurchargeTier(t.id, t.name, t.percentage);
      }
      queryClient.invalidateQueries({ queryKey: ["surcharge-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["price-settings"] });
      toast({ title: "Porcentajes actualizados" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const generateSlug = (name: string) => {
    return name.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newPct) return;
    const slug = generateSlug(newName);
    if (!slug) {
      toast({ title: "Nombre inválido", variant: "destructive" });
      return;
    }
    if (localTiers.some(t => t.slug === slug)) {
      toast({ title: "Ya existe un recargo con ese identificador", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const tier = await addSurchargeTier(newName.trim(), slug, parseFloat(newPct) || 0);
      // Create product_prices rows for all products
      await ensureAllProductsHaveTier(slug);
      queryClient.invalidateQueries({ queryKey: ["surcharge-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["price-settings"] });
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      setNewName("");
      setNewPct("");
      toast({ title: `"${tier.name}" agregado` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (tier: SurchargeTier) => {
    if (!confirm(`¿Eliminar "${tier.name}"? Se borrarán los precios asociados.`)) return;
    try {
      await deleteSurchargeTier(tier.id);
      queryClient.invalidateQueries({ queryKey: ["surcharge-tiers"] });
      queryClient.invalidateQueries({ queryKey: ["price-settings"] });
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      toast({ title: `"${tier.name}" eliminado` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await recalculateAllPrices();
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      toast({ title: "Todos los precios recalculados" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const hasDirty = localTiers.some(t => t._dirty);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración de Recargos</DialogTitle>
          <DialogDescription>Porcentajes de recargo globales. Podés agregar nuevos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {localTiers.map((tier) => (
            <div key={tier.id} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Nombre</Label>
                <Input
                  value={tier.name}
                  onChange={(e) => updateLocal(tier.id, "name", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs text-muted-foreground">%</Label>
                <Input
                  type="number"
                  min="0"
                  value={tier.percentage}
                  onChange={(e) => updateLocal(tier.id, "percentage", e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                onClick={() => handleDelete(tier)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* Add new tier inline */}
          <div className="flex items-end gap-2 pt-2 border-t border-dashed border-border">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Nuevo recargo</Label>
              <Input
                placeholder="Ej: Crédito 6 cuotas"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs text-muted-foreground">%</Label>
              <Input
                type="number"
                min="0"
                placeholder="35"
                value={newPct}
                onChange={(e) => setNewPct(e.target.value)}
                className="h-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newPct}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {hasDirty && (
            <Button onClick={handleSaveAll} disabled={saving} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          )}
          <Button variant="outline" onClick={handleRecalculate} disabled={recalculating} className="w-full">
            <RefreshCw className={`mr-2 h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recalculando..." : "Recalcular todos los productos"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
