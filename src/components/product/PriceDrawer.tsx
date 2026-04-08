import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import {
  ensureProductPrices, saveProductPrices, fetchSurchargeTiers,
  type ProductPrice, type SurchargeTier,
} from "@/lib/price-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
}

export default function PriceDrawer({ open, onOpenChange, productId, productName }: Props) {
  const queryClient = useQueryClient();
  const [baseRest, setBaseRest] = useState("");
  const [baseDel, setBaseDel] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: tiers = [] } = useQuery<SurchargeTier[]>({
    queryKey: ["surcharge-tiers"],
    queryFn: fetchSurchargeTiers,
  });

  const { data: prices } = useQuery<ProductPrice[]>({
    queryKey: ["product-prices", productId],
    queryFn: () => ensureProductPrices(productId!),
    enabled: !!productId && open,
  });

  useEffect(() => {
    if (prices) {
      const br = prices.find((p) => p.channel === "RESTAURANTE" && p.term === "BASE");
      const bd = prices.find((p) => p.channel === "DELIVERY" && p.term === "BASE");
      setBaseRest(br && br.price > 0 ? String(br.price) : "");
      setBaseDel(bd && bd.price > 0 ? String(bd.price) : "");
    }
  }, [prices]);

  const calc = (base: string, pct: number) => {
    const n = parseFloat(base) || 0;
    return n > 0 ? Math.round(n * (1 + pct / 100)) : 0;
  };

  const handleSave = async () => {
    if (!productId || tiers.length === 0) return;
    const br = parseFloat(baseRest) || 0;
    const bd = parseFloat(baseDel) || 0;
    if (br < 0 || bd < 0) {
      toast({ title: "Los precios no pueden ser negativos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveProductPrices(productId, br, bd, tiers);
      queryClient.invalidateQueries({ queryKey: ["product-prices", productId] });
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      toast({ title: "Precios guardados" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyRestToDelivery = () => {
    setBaseDel(baseRest);
  };

  const tiersSummary = tiers.map(t => `${t.name}: +${t.percentage}%`).join(" | ");

  const ChannelCard = ({ title, base, setBase }: { title: string; base: string; setBase: (v: string) => void }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">BASE (Efectivo)</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </div>
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(tiers.length, 3)}, 1fr)` }}>
          {tiers.map((tier) => (
            <div key={tier.id} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{tier.name} (+{tier.percentage}%)</Label>
              <Input readOnly className="bg-muted" value={calc(base, tier.percentage) || ""} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Precios: {productName}</SheetTitle>
          <SheetDescription className="text-xs">
            {tiersSummary || "Sin recargos configurados"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <ChannelCard title="RESTAURANTE" base={baseRest} setBase={setBaseRest} />

          <Button variant="outline" size="sm" className="w-full" onClick={copyRestToDelivery}>
            <Copy className="mr-2 h-3 w-3" /> Copiar Restaurante → Delivery
          </Button>

          <ChannelCard title="DELIVERY" base={baseDel} setBase={setBaseDel} />
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
