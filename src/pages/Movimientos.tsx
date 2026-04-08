import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { BookOpen, ArrowDownCircle, ArrowUpCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";

import {
  fetchMovements,
  fetchSaleDetail,
  fetchExpenseDetail,
  type FinanceMovement,
} from "@/lib/movimientos-store";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

type RangePreset = "today" | "7days" | "month" | "custom";

export default function Movimientos() {
  const today = format(new Date(), "yyyy-MM-dd");

  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  // Filters
  const [direction, setDirection] = useState("ALL");
  const [movementType, setMovementType] = useState("ALL");
  const [channel, setChannel] = useState("ALL");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [fund, setFund] = useState("ALL");
  const [search, setSearch] = useState("");

  // Drawer
  const [selected, setSelected] = useState<FinanceMovement | null>(null);

  const { from, to } = useMemo(() => {
    switch (preset) {
      case "today": return { from: today, to: today };
      case "7days": return { from: format(subDays(new Date(), 6), "yyyy-MM-dd"), to: today };
      case "month": return { from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: today };
      case "custom": return { from: customFrom, to: customTo };
    }
  }, [preset, customFrom, customTo, today]);

  const filters = useMemo(() => ({
    from, to,
    direction: direction !== "ALL" ? direction : undefined,
    movement_type: movementType !== "ALL" ? movementType : undefined,
    channel: channel !== "ALL" ? channel : undefined,
    payment_method: paymentMethod !== "ALL" ? paymentMethod : undefined,
    fund: fund !== "ALL" ? fund : undefined,
    search: search || undefined,
  }), [from, to, direction, movementType, channel, paymentMethod, fund, search]);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movimientos", filters],
    queryFn: () => fetchMovements(filters),
  });

  // Totals
  const totals = useMemo(() => {
    let amount = 0, local = 0, rest = 0;
    for (const m of movements) {
      const sign = m.direction === "IN" ? 1 : -1;
      amount += sign * m.amount;
      local += sign * m.amount_local;
      rest += sign * m.amount_restaurant;
    }
    return { amount, local, rest };
  }, [movements]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Movimientos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "7days", "month", "custom"] as RangePreset[]).map((p) => (
            <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
              {p === "today" ? "Hoy" : p === "7days" ? "7 días" : p === "month" ? "Mes" : "Custom"}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <FilterSelect label="Dirección" value={direction} onChange={setDirection}
          options={[{ v: "ALL", l: "Todas" }, { v: "IN", l: "Entrada" }, { v: "OUT", l: "Salida" }]} />
        <FilterSelect label="Tipo" value={movementType} onChange={setMovementType}
          options={[{ v: "ALL", l: "Todos" }, { v: "SALE", l: "Venta" }, { v: "EXPENSE", l: "Gasto" }]} />
        <FilterSelect label="Canal" value={channel} onChange={setChannel}
          options={[{ v: "ALL", l: "Todos" }, { v: "RESTAURANTE", l: "Restaurante" }, { v: "DELIVERY", l: "Delivery" }]} />
        <FilterSelect label="Medio" value={paymentMethod} onChange={setPaymentMethod}
          options={[{ v: "ALL", l: "Todos" }, { v: "EFECTIVO", l: "Efectivo" }, { v: "QR", l: "QR" }, { v: "TRANSFERENCIA", l: "Transferencia" }, { v: "TARJETA", l: "Tarjeta" }]} />
        <FilterSelect label="Fondo" value={fund} onChange={setFund}
          options={[{ v: "ALL", l: "Todos" }, { v: "EFECTIVO", l: "Efectivo" }, { v: "MERCADOPAGO", l: "MercadoPago" }]} />
        <div>
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Descripción…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-44 h-9" />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span>{movements.length} movimientos</span>
        <span className="text-muted-foreground">Neto: {fmt(totals.amount)}</span>
        <span className="text-muted-foreground">Local: {fmt(totals.local)}</span>
        <span className="text-muted-foreground">Rest: {fmt(totals.rest)}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : movements.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin movimientos en el rango.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Dir.</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Fondo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Ing. míos</TableHead>
                <TableHead className="text-right">Rest.</TableHead>
                <TableHead>Referencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.movement_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(m)}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(m.occurred_at), "dd/MM HH:mm", { locale: es })}
                  </TableCell>
                  <TableCell>
                    {m.direction === "IN" ? (
                      <Badge variant="outline" className="text-green-600 border-green-300">
                        <ArrowDownCircle className="h-3 w-3 mr-1" />IN
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-500 border-red-300">
                        <ArrowUpCircle className="h-3 w-3 mr-1" />OUT
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{m.movement_type}</TableCell>
                  <TableCell className="text-xs truncate max-w-[100px]">{m.user_name || "—"}</TableCell>
                  <TableCell className="text-xs">{m.channel || "—"}</TableCell>
                  <TableCell className="text-xs">{m.payment_method || "—"}</TableCell>
                  <TableCell className="text-xs">{m.fund || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(m.amount)}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(m.amount_local)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(m.amount_restaurant)}</TableCell>
                  <TableCell className="text-xs truncate max-w-[120px]">{m.reference_label || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Drawer */}
      <MovementDrawer movement={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[120px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MovementDrawer({ movement, onClose }: { movement: FinanceMovement | null; onClose: () => void }) {
  const isSale = movement?.movement_type === "SALE";

  const detailQ = useQuery<any>({
    queryKey: ["movement-detail", movement?.source_id, movement?.movement_type],
    queryFn: () =>
      isSale
        ? fetchSaleDetail(movement!.source_id as string)
        : fetchExpenseDetail(movement!.source_id as string),
    enabled: !!movement,
  });

  return (
    <Drawer open={!!movement} onOpenChange={() => onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle>
            {movement?.direction === "IN" ? "Entrada" : "Salida"} — {movement?.reference_label}
          </DrawerTitle>
          <DrawerDescription>
            {movement ? format(new Date(movement.occurred_at), "EEEE dd/MM/yyyy HH:mm", { locale: es }) : ""}
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-4 overflow-auto">
          {detailQ.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {detailQ.data && isSale && <SaleDetailView data={detailQ.data as any} />}
          {detailQ.data && !isSale && <ExpenseDetailView data={detailQ.data as any} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SaleDetailView({ data }: { data: { sale: any; items: any[]; payments: any[] } }) {
  if (!data.sale) return <p className="text-sm text-muted-foreground">Venta no encontrada</p>;

  const totalCost = data.items.reduce((s: number, i: any) => s + (i.cost_snapshot ?? 0) * i.qty, 0);
  const totalRevenue = data.items.reduce((s: number, i: any) => s + i.line_total, 0);
  const totalMargin = totalRevenue - totalCost;
  const totalCommission = data.payments.reduce((s: number, p: any) => s + (p.commission_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">Canal:</span> {data.sale.channel}</div>
        <div><span className="text-muted-foreground">Término:</span> {data.sale.price_term}</div>
        <div><span className="text-muted-foreground">Local:</span> {fmt(data.sale.subtotal_local)}</div>
        <div><span className="text-muted-foreground">Restaurante:</span> {fmt(data.sale.subtotal_restaurant)}</div>
        <div><span className="text-muted-foreground">Envío:</span> {fmt(data.sale.delivery_fee)}</div>
        <div><span className="text-muted-foreground font-bold">Total:</span> <strong>{fmt(data.sale.total)}</strong></div>
      </div>

      {/* Resumen contable */}
      <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Ingreso bruto</span><span>{fmt(totalRevenue)}</span></div>
        {totalCommission > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">Comisión procesador</span><span className="text-destructive">-{fmt(totalCommission)}</span></div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Costo mercadería</span><span className="text-destructive">-{fmt(totalCost)}</span></div>
        <div className="flex justify-between font-semibold border-t pt-1">
          <span>Margen neto</span>
          <span className={totalMargin - totalCommission >= 0 ? "text-green-600" : "text-destructive"}>
            {fmt(totalMargin - totalCommission)}
          </span>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-1">Ítems</h4>
        <div className="space-y-1">
          {data.items.map((i: any) => {
            const cost = (i.cost_snapshot ?? 0) * i.qty;
            const margin = i.line_total - cost;
            const marginPct = i.line_total > 0 ? Math.round((margin / i.line_total) * 100) : 0;
            const isOffer = i.item_type === 'OFFER';
            return (
              <div key={i.id} className="text-sm border rounded p-2 space-y-0.5">
                <div className="flex justify-between items-start">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {isOffer && <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">OFERTA</Badge>}
                    {i.qty}x {i.name_snapshot} {i.variant_snapshot && <span className="text-muted-foreground">({i.variant_snapshot})</span>}
                  </span>
                  <span className="font-medium">{fmt(i.line_total)}</span>
                </div>
                {isOffer && i.offer_name_snapshot && (
                  <div className="text-xs text-muted-foreground">Oferta: {i.offer_name_snapshot}</div>
                )}
                {cost > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Costo: {fmt(cost)}</span>
                    <span className={margin >= 0 ? "text-green-600" : "text-destructive"}>
                      Margen: {fmt(margin)} ({marginPct}%)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-1">Pagos</h4>
        <div className="space-y-1">
          {data.payments.map((p: any) => (
            <div key={p.id} className="text-sm border rounded p-2 space-y-0.5">
              <div className="flex justify-between">
                <span>{p.payment_method} → {p.fund}</span>
                <span className="font-medium">{fmt(p.amount)}</span>
              </div>
              {(p.commission_amount ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">
                  Comisión: <span className="text-destructive">{fmt(p.commission_amount)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpenseDetailView({ data }: { data: any }) {
  return (
    <div className="space-y-2 text-sm">
      <div><span className="text-muted-foreground">Fecha:</span> {data.date}</div>
      <div><span className="text-muted-foreground">Monto:</span> <strong>{fmt(data.amount)}</strong></div>
      <div><span className="text-muted-foreground">Medio:</span> {data.payment_method}</div>
      <div><span className="text-muted-foreground">Fondo:</span> {data.fund}</div>
      <div><span className="text-muted-foreground">Categoría:</span> {data.category || "—"}</div>
      <div><span className="text-muted-foreground">Descripción:</span> {data.description || "—"}</div>
      {data.is_pass_through && (
        <Badge variant="secondary">Pass-through (rendición)</Badge>
      )}
    </div>
  );
}
