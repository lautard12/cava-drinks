import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveOffersForPOS,
  type OfferWithItems,
} from "@/lib/offer-store";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Tag, AlertCircle, Package } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectOffer: (offer: OfferWithItems) => void;
  /** Stock map: product_id -> available qty */
  stockMap: Record<string, number>;
  /** Already-required qty by product_id from current cart/tab */
  cartRequirements: Record<string, number>;
}

export function OffersSheet({ open, onOpenChange, onSelectOffer, stockMap, cartRequirements }: Props) {
  const [search, setSearch] = useState("");

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["pos-active-offers"],
    queryFn: fetchActiveOffersForPOS,
    enabled: open,
  });

  const enrichedOffers = useMemo(() => {
    let list = offers;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(s));
    }

    return list.map((offer) => {
      const missingItems: { name: string; available: number; needed: number }[] = [];

      for (const oi of offer.items) {
        if (!oi.track_stock) continue;
        const available = stockMap[oi.product_id] ?? oi.qty_on_hand;
        const alreadyNeeded = cartRequirements[oi.product_id] ?? 0;
        const totalNeeded = alreadyNeeded + oi.qty;
        if (totalNeeded > available) {
          missingItems.push({
            name: oi.product_name + (oi.variant_label ? ` ${oi.variant_label}` : ""),
            available,
            needed: totalNeeded,
          });
        }
      }

      return { ...offer, hasStock: missingItems.length === 0, missingItems };
    });
  }, [offers, search, stockMap, cartRequirements]);

  const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" /> Ofertas
          </SheetTitle>
          <SheetDescription className="sr-only">Seleccionar una oferta</SheetDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar oferta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando ofertas...</p>
          ) : enrichedOffers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay ofertas activas</p>
          ) : (
            <div className="space-y-2">
              {enrichedOffers.map((offer) => (
                <div
                  key={offer.id}
                  className={`rounded-md border p-3 space-y-2 ${
                    offer.hasStock
                      ? "cursor-pointer hover:bg-muted/50"
                      : "opacity-60 cursor-not-allowed"
                  }`}
                  onClick={() => offer.hasStock && onSelectOffer(offer)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{offer.name}</span>
                      <Badge
                        variant="outline"
                        className={offer.type === "COMBO"
                          ? "bg-violet-100 text-violet-800 border-violet-200 text-xs"
                          : "bg-sky-100 text-sky-800 border-sky-200 text-xs"
                        }
                      >
                        {offer.type === "COMBO" ? "Combo" : "Cantidad"}
                      </Badge>
                    </div>
                    <span className="font-bold text-sm">{fmt(offer.offer_price)}</span>
                  </div>

                  <div className="space-y-0.5">
                    {offer.items.map((oi) => (
                      <div key={oi.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" />
                        <span>{oi.product_name}{oi.variant_label ? ` ${oi.variant_label}` : ""}</span>
                        <span>×{oi.qty}</span>
                      </div>
                    ))}
                  </div>

                  {!offer.hasStock && (
                    <div className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Sin stock:
                      {offer.missingItems.map((m, i) => (
                        <span key={i}>{i > 0 && ", "}{m.name} (disp: {m.available})</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
