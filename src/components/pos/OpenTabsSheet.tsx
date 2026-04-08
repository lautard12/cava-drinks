import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Clock, ShoppingBag } from "lucide-react";
import { fetchOpenTabs, type OpenTab } from "@/lib/tab-store";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTab: (tab: OpenTab) => void;
}

export function OpenTabsSheet({ open, onOpenChange, onSelectTab }: Props) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchOpenTabs()
      .then(setTabs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = search
    ? tabs.filter((t) =>
        (t.tab_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        t.id.slice(-6).toUpperCase().includes(search.toUpperCase())
      )
    : tabs;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cuentas abiertas</SheetTitle>
          <SheetDescription>{tabs.length} cuenta{tabs.length !== 1 ? "s" : ""} abierta{tabs.length !== 1 ? "s" : ""}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-200px)]">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin cuentas abiertas</p>
            ) : (
              <div className="space-y-2 pr-2">
                {filtered.map((tab) => (
                  <div
                    key={tab.id}
                    className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      onSelectTab(tab);
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold">
                        {tab.tab_name || `Cuenta #${tab.id.slice(-6).toUpperCase()}`}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        ${tab.total.toLocaleString("es-AR")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="h-3 w-3" />
                        {tab.item_count} ítem{tab.item_count !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(tab.opened_at), { locale: es, addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
