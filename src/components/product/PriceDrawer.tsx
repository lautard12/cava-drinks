import { useState, useEffect, useMemo } from "react";
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
  ensureProductPrices, saveProductPrices, findAnchor,
  type ProductPrice,
} from "@/lib/price-store";
import { fetchPriceTerms, type PriceTerm } from "@/lib/config-store";

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

  const { data: terms = [] } = useQuery<PriceTerm[]>({
    queryKey: ["price-terms"],
    queryFn: fetchPriceTerms,
  });
  const activeTerms = useMemo(
    () => terms.filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [terms],
  );
  const anchor = findAnchor(activeTerms);
  const derivedTerms = activeTerms.filter((t) => anchor && t.code !== anchor.code);

  const { data: prices } = useQuery<ProductPrice[]>({
    queryKey: ["product-prices", productId],
    queryFn: () => ensureProductPrices(productId!),
    enabled: !!productId && open,
  });

  useEffect(() => {
    if (prices && anchor) {
      const br = prices.find((p) => p.channel === "RESTAURANTE" && p.term === anchor.code);
      const bd = prices.find((p) => p.channel === "DELIVERY" && p.term === anchor.code);
      setBaseRest(br && br.price > 0 ? String(br.price) : "");
      setBaseDel(bd && bd.price > 0 ? String(bd.price) : "");
    }
  }, [prices, anchor]);

  const calc = (base: string, pct: number) => {
    const n = parseFloat(base) || 0;
    return n > 0 ? Math.round(n * (1 + pct / 100)) : 0;
  };

  const handleSave = async () => {
    if (!productId || activeTerms.length === 0 || !anchor) return;
    const br = parseFloat(baseRest) || 0;
    const bd = parseFloat(baseDel) || 0;
    if (br < 0 || bd < 0) {
      toast({ title: "Los precios no pueden ser negativos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveProductPrices(productId, br, bd, activeTerms);
      queryClient.invalidateQueries({ queryKey: ["product-prices", productId] });
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      toast({ title: "Precios guardados" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyRestToDelivery = () => {
    setBaseDel(baseRest);
  };

  const tiersSummary = derivedTerms.map((t) => `${t.label}: +${t.surcharge_pct}%`).join(" | ");

  const ChannelCard = ({ title, base, setBase }: { title: string; base: string; setBase: (v: string) => void }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">{anchor ? `${anchor.label} (precio base)` : "Sin ancla"}</Label>
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            disabled={!anchor}
          />
        </div>
        {derivedTerms.length > 0 && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(derivedTerms.length, 3)}, 1fr)` }}
          >
            {derivedTerms.map((tier) => (
              <div key={tier.id} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {tier.label} (+{tier.surcharge_pct}%)
                </Label>
                <Input readOnly className="bg-muted" value={calc(base, tier.surcharge_pct) || ""} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Precios: {productName}</SheetTitle>
          <SheetDescription className="text-xs">
            {anchor ? tiersSummary || "Sin recargos configurados" : "No hay un término ancla configurado en Precios y Cobros."}
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
          <Button onClick={handleSave} disabled={saving || !anchor}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
