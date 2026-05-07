import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign, Trash2, ChevronDown, Package, Receipt, Minus, Equal, ArrowRight, AlertCircle, ArrowUpCircle, ArrowDownCircle, Banknote, Smartphone, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UtensilsCrossed } from "lucide-react";

import {
  fetchResultadoRange,
  fetchDayDetail,
  fetchRestauranteRange,
  fetchExpensesRange,
  createExpense,
  deleteExpense,
  fetchCapitalRange,
  upsertOpeningBalance,
  createFundMovement,
  deleteFundMovement,
  fetchSalesByDay,
  fetchSaleDetail,
  computeFund,
  type DayRow,
  type DayDetail,
  type Expense,
  type CapitalSnapshot,
  type CapitalFundRow,
  type FundMovement,
  type Fund,
  type SaleSummary,
  type SaleDetail,
} from "@/lib/finanzas-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchExpenseCategories } from "@/lib/config-store";
import {
  fetchSettlementsRange,
  deleteSettlement,
  type RestaurantSettlement,
} from "@/lib/restaurant-settlement-store";
import { SettlementModal } from "@/components/finanzas/SettlementModal";
import { SettlementReceiptModal } from "@/components/finanzas/SettlementReceiptModal";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

// Formatea el key de agrupación a algo legible.
// "2026-04-24" → "mié 24/04"; "2026-04" → "Abril 2026"; "2026" → "2026"
function formatPeriodLabel(key: string, groupBy: "day" | "month" | "year"): string {
  if (groupBy === "year") return key;
  if (groupBy === "month") {
    const d = new Date(key + "-01T12:00:00");
    const label = format(d, "MMMM yyyy", { locale: es });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const d = new Date(key + "T12:00:00");
  return format(d, "EEE dd/MM", { locale: es });
}

const PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "QR", label: "QR" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA", label: "Tarjeta" },
];

type RangePreset = "today" | "7days" | "month" | "custom";

export default function Finanzas() {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const { from, to } = useMemo(() => {
    switch (preset) {
      case "today":
        return { from: today, to: today };
      case "7days":
        return { from: format(subDays(new Date(), 6), "yyyy-MM-dd"), to: today };
      case "month":
        return { from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: today };
      case "custom":
        return { from: customFrom, to: customTo };
    }
  }, [preset, customFrom, customTo, today]);

  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [groupBy, setGroupBy] = useState<"day" | "month" | "year">("day");
  const [expGroupBy, setExpGroupBy] = useState<"day" | "month" | "year">("day");
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resultadoQ = useQuery({
    queryKey: ["finanzas-resultado", from, to],
    queryFn: () => fetchResultadoRange(from, to),
  });

  const restauranteQ = useQuery({
    queryKey: ["finanzas-restaurante", from, to],
    queryFn: () => fetchRestauranteRange(from, to),
  });

  const gastosQ = useQuery({
    queryKey: ["finanzas-gastos", from, to],
    queryFn: () => fetchExpensesRange(from, to),
  });

  const dayDetailQ = useQuery({
    queryKey: ["finanzas-day", dayDetailDate],
    queryFn: () => fetchDayDetail(dayDetailDate!),
    enabled: !!dayDetailDate,
  });

  const capitalQ = useQuery({
    queryKey: ["finanzas-capital", from, to],
    queryFn: () => fetchCapitalRange(from, to),
  });

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const dayalesQ = useQuery({
    queryKey: ["finanzas-day-sales", dayDetailDate],
    queryFn: () => fetchSalesByDay(dayDetailDate!),
    enabled: !!dayDetailDate,
  });

  const saleDetailQ = useQuery({
    queryKey: ["finanzas-sale-detail", selectedSaleId],
    queryFn: () => fetchSaleDetail(selectedSaleId!),
    enabled: !!selectedSaleId,
  });

  const [showBalanceModal, setShowBalanceModal] = useState<{ fund: Fund } | null>(null);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementToDelete, setMovementToDelete] = useState<FundMovement | null>(null);

  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementToDelete, setSettlementToDelete] = useState<RestaurantSettlement | null>(null);
  const [settlementReceipt, setSettlementReceipt] = useState<RestaurantSettlement | null>(null);

  const settlementsQ = useQuery({
    queryKey: ["finanzas-settlements", from, to],
    queryFn: () => fetchSettlementsRange(from, to),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["finanzas-resultado"] });
    qc.invalidateQueries({ queryKey: ["finanzas-day"] });
    qc.invalidateQueries({ queryKey: ["finanzas-restaurante"] });
    qc.invalidateQueries({ queryKey: ["finanzas-gastos"] });
    qc.invalidateQueries({ queryKey: ["finanzas-capital"] });
    qc.invalidateQueries({ queryKey: ["finanzas-settlements"] });
  };

  const rows = resultadoQ.data ?? [];
  const totalBruto = rows.reduce((s, r) => s + r.bruto, 0);
  const totalComisionesCliente = rows.reduce((s, r) => s + r.comisionesCliente, 0);
  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);
  const totalGastos = rows.reduce((s, r) => s + r.gastos, 0);
  const totalGanancia = rows.reduce((s, r) => s + r.ganancia, 0);
  const totalMargenBruto = totalBruto - totalCogs;

  const periodLabel = preset === "today" ? "Hoy" : preset === "7days" ? "Últimos 7 días" : preset === "month" ? "Este mes" : `${from} a ${to}`;

  // Restaurante aggregation
  const restRows = restauranteQ.data ?? [];
  const totalRestVendido = restRows.reduce((s, r) => s + r.totalVendido, 0);
  const totalRestTickets = restRows.reduce((s, r) => s + r.tickets, 0);
  const totalRestUnidades = restRows.reduce((s, r) => s + r.unidades, 0);

  const restGrouped = useMemo(() => {
    const grouped = new Map<string, { period: string; totalVendido: number; tickets: number; unidades: number }>();
    for (const r of restRows) {
      let key: string;
      if (groupBy === "day") key = r.date;
      else if (groupBy === "month") key = r.date.slice(0, 7);
      else key = r.date.slice(0, 4);
      const existing = grouped.get(key);
      if (existing) {
        existing.totalVendido += r.totalVendido;
        existing.tickets += r.tickets;
        existing.unidades += r.unidades;
      } else {
        grouped.set(key, { period: key, totalVendido: r.totalVendido, tickets: r.tickets, unidades: r.unidades });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.period.localeCompare(a.period));
  }, [restRows, groupBy]);

  // Gastos aggregation
  const allExpenses = gastosQ.data ?? [];
  const totalExpAmount = allExpenses.reduce((s, e) => s + e.amount, 0);
  const totalExpOperative = allExpenses.filter(e => !e.is_pass_through).reduce((s, e) => s + e.amount, 0);
  const totalExpPassThrough = allExpenses.filter(e => e.is_pass_through).reduce((s, e) => s + e.amount, 0);

  const expGrouped = useMemo(() => {
    const grouped = new Map<string, { period: string; total: number; operative: number; passThrough: number; count: number; items: Expense[] }>();
    for (const e of allExpenses) {
      let key: string;
      if (expGroupBy === "day") key = e.date;
      else if (expGroupBy === "month") key = e.date.slice(0, 7);
      else key = e.date.slice(0, 4);
      const existing = grouped.get(key);
      if (existing) {
        existing.total += e.amount;
        if (e.is_pass_through) existing.passThrough += e.amount;
        else existing.operative += e.amount;
        existing.count += 1;
        existing.items.push(e);
      } else {
        grouped.set(key, {
          period: key,
          total: e.amount,
          operative: e.is_pass_through ? 0 : e.amount,
          passThrough: e.is_pass_through ? e.amount : 0,
          count: 1,
          items: [e],
        });
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.period.localeCompare(a.period));
  }, [allExpenses, expGroupBy]);

  // Sólo gastos operativos — las rendiciones (pass-through) no son gasto del local.
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of allExpenses) {
      if (e.is_pass_through) continue;
      const cat = e.category || "Sin categoría";
      map.set(cat, (map.get(cat) ?? 0) + e.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [allExpenses]);

  const hasData = totalBruto > 0 || totalGastos > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Finanzas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "7days", "month", "custom"] as RangePreset[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => setPreset(p)}
            >
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

      <p className="text-sm text-muted-foreground">
        Rango: {format(new Date(from + "T12:00:00"), "dd/MM/yyyy")} — {format(new Date(to + "T12:00:00"), "dd/MM/yyyy")}
      </p>

      {/* Tabs */}
      <Tabs defaultValue="resultado">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="resultado" className="flex-1">Resultado</TabsTrigger>
          <TabsTrigger value="gastos" className="flex-1">Gastos</TabsTrigger>
          <TabsTrigger value="capital" className="flex-1">Capital</TabsTrigger>
          <TabsTrigger value="restaurante" className="flex-1">Restaurante</TabsTrigger>
        </TabsList>

        {/* ─── TAB RESULTADO ─── */}
        <TabsContent value="resultado" className="space-y-4">
          {resultadoQ.isLoading ? (
            <p className="text-muted-foreground text-sm">Cargando…</p>
          ) : !hasData ? (
            <EmptyFinanceState />
          ) : (
            <>
              {/* KPI Cards */}
              {/* Ganancia Neta destacada */}
              <Card className={`border-2 ${totalGanancia >= 0 ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-destructive/40 bg-destructive/5"}`}>
                <CardContent className="flex items-center justify-between py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-2.5 ${totalGanancia >= 0 ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-destructive/10"}`}>
                      {totalGanancia >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Ganancia Neta</p>
                      <p className={`text-2xl font-bold ${totalGanancia >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                        {fmt(totalGanancia)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <KpiCard label="Ingreso del local" value={totalBruto} icon={DollarSign} />
                <KpiCard label="Margen bruto" value={totalMargenBruto} positive={totalMargenBruto > 0} />
              </div>

              {/* Waterfall Card */}
              <WaterfallCard
                bruto={totalBruto}
                comisionesCliente={totalComisionesCliente}
                cogs={totalCogs}
                margenBruto={totalMargenBruto}
                gastos={totalGastos}
                ganancia={totalGanancia}
                periodLabel={periodLabel}
              />

              {/* Daily Table */}
              <DailyTable rows={rows} onDayClick={(d) => setDayDetailDate(d)} />
            </>
          )}
        </TabsContent>

        {/* ─── TAB GASTOS ─── */}
        <TabsContent value="gastos" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Total gastos" value={totalExpAmount} icon={Receipt} negative />
            <KpiCard label="Operativos" value={totalExpOperative} negative />
            <KpiCard label="Rendiciones" value={totalExpPassThrough} />
          </div>

          {categoryBreakdown.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  Desglose por categoría
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-md border p-4 space-y-2 mt-2">
                  {categoryBreakdown.map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between items-center text-sm">
                      <span>{cat}</span>
                      <span className="font-medium text-destructive">{fmt(amount)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-1">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span>Total operativos</span>
                      <span className="text-destructive">{fmt(totalExpOperative)}</span>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Agrupar por:</span>
              <ToggleGroup type="single" value={expGroupBy} onValueChange={(v) => v && setExpGroupBy(v as any)} size="sm">
                <ToggleGroupItem value="day">Día</ToggleGroupItem>
                <ToggleGroupItem value="month">Mes</ToggleGroupItem>
                <ToggleGroupItem value="year">Año</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Button size="sm" onClick={() => setShowExpenseModal(true)}>
              <Plus className="h-4 w-4 mr-1" /> Registrar gasto
            </Button>
          </div>

          {gastosQ.isLoading ? (
            <p className="text-muted-foreground text-sm">Cargando…</p>
          ) : expGrouped.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin gastos en el rango.</p>
          ) : (
            <div className="space-y-3">
              {expGrouped.map((g) => (
                <Collapsible key={g.period}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatPeriodLabel(g.period, expGroupBy)}</span>
                        <span className="text-xs text-muted-foreground">{g.count} gasto{g.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-destructive">{fmt(g.total)}</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-2 border-l pl-3 mt-1 space-y-2">
                      {g.items.map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-sm py-1">
                          <div>
                            <p className="font-medium">{e.category}{e.is_pass_through ? " (rendición)" : ""}</p>
                            <p className="text-xs text-muted-foreground">
                              {e.description ? `${e.description} — ` : ""}{e.payment_method} → {e.fund}
                              {expGroupBy !== "day" && ` — ${format(new Date(e.date + "T12:00:00"), "dd/MM/yyyy")}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-destructive">{fmt(e.amount)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setExpenseToDelete(e)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── TAB CAPITAL ─── */}
        <TabsContent value="capital" className="space-y-4">
          <CapitalTab
            data={capitalQ.data}
            loading={capitalQ.isLoading}
            onEditBalance={(fund) => setShowBalanceModal({ fund })}
            onAddMovement={() => setShowMovementModal(true)}
            onDeleteMovement={(m) => setMovementToDelete(m)}
            periodLabel={periodLabel}
          />
        </TabsContent>

        {/* ─── TAB RESTAURANTE ─── */}
        <TabsContent value="restaurante" className="space-y-4">
          {/* Card de rendición — siempre arriba, usa los acumulados históricos del query de capital */}
          <RendicionCard
            capital={capitalQ.data}
            loading={capitalQ.isLoading}
            onRegistrar={() => setShowSettlementModal(true)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="A rendir (en el rango)" value={totalRestVendido} icon={UtensilsCrossed} />
            <KpiCard label="Tickets con comida" value={totalRestTickets} icon={UtensilsCrossed} isCount />
            <KpiCard label="Unidades vendidas" value={totalRestUnidades} icon={Package} isCount />
          </div>
          <p className="text-xs text-muted-foreground">
            Incluye comida + envío (delivery_fee). El "Pendiente" de arriba es histórico, los KPIs son del rango seleccionado.
          </p>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Agrupar por:</span>
            <ToggleGroup type="single" value={groupBy} onValueChange={(v) => v && setGroupBy(v as any)} size="sm">
              <ToggleGroupItem value="day">Día</ToggleGroupItem>
              <ToggleGroupItem value="month">Mes</ToggleGroupItem>
              <ToggleGroupItem value="year">Año</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {restauranteQ.isLoading ? (
            <p className="text-muted-foreground text-sm">Cargando…</p>
          ) : restGrouped.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin datos en el rango.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead className="text-right">Unidades vendidas</TableHead>
                    <TableHead className="text-right">Total vendido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restGrouped.map((r) => (
                    <TableRow key={r.period}>
                      <TableCell className="font-medium">{formatPeriodLabel(r.period, groupBy)}</TableCell>
                      <TableCell className="text-right">{r.tickets}</TableCell>
                      <TableCell className="text-right">{r.unidades}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.totalVendido)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Rendiciones registradas en el rango */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rendiciones registradas — {periodLabel}</CardTitle>
              <CardDescription>
                Pagos que le hiciste al dueño del restaurante. Cada uno baja el saldo del fondo elegido en la tab Capital.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {settlementsQ.isLoading ? (
                <p className="text-muted-foreground text-sm p-4">Cargando…</p>
              ) : (settlementsQ.data ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm p-4">Sin rendiciones en el rango.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Fondo</TableHead>
                      <TableHead>Notas</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="w-32 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(settlementsQ.data ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{format(new Date(s.date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.period_from && s.period_to
                            ? `${format(new Date(s.period_from + "T12:00:00"), "dd/MM")} → ${format(new Date(s.period_to + "T12:00:00"), "dd/MM/yyyy")}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.fund === "EFECTIVO" ? "Efectivo" : "MercadoPago"}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.notes ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt(s.amount)}</TableCell>
                        <TableCell className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSettlementReceipt(s)}
                          >
                            <Receipt className="h-3.5 w-3.5 mr-1" /> Recibo
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setSettlementToDelete(s)}
                            aria-label="Eliminar rendición"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── MODAL: Day Detail ─── */}
      <DayDetailDialog
        date={dayDetailDate}
        data={dayDetailQ.data}
        sales={dayalesQ.data ?? []}
        salesLoading={dayalesQ.isLoading}
        loading={dayDetailQ.isLoading}
        onClose={() => setDayDetailDate(null)}
        onDeleteExpense={(e) => setExpenseToDelete(e)}
        onSelectSale={(id) => setSelectedSaleId(id)}
      />

      {/* ─── MODAL: Sale Detail ─── */}
      <SaleDetailDialog
        saleId={selectedSaleId}
        data={saleDetailQ.data ?? null}
        loading={saleDetailQ.isLoading}
        onClose={() => setSelectedSaleId(null)}
      />

      <ExpenseModal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSaved={() => {
          invalidate();
          setShowExpenseModal(false);
        }}
      />

      <AlertDialog open={!!expenseToDelete} onOpenChange={(open) => !open && !deleting && setExpenseToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {expenseToDelete && (
            <div className="text-sm space-y-1 rounded-md border p-3 bg-muted/40">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Categoría</span>
                <span className="font-medium">{expenseToDelete.category}</span>
              </div>
              {expenseToDelete.description && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descripción</span>
                  <span className="font-medium">{expenseToDelete.description}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-bold text-destructive">{fmt(expenseToDelete.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha</span>
                <span className="font-medium">{format(new Date(expenseToDelete.date + "T12:00:00"), "dd/MM/yyyy")}</span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async (ev) => {
                ev.preventDefault();
                if (!expenseToDelete) return;
                setDeleting(true);
                try {
                  await deleteExpense(expenseToDelete.id);
                  toast.success("Gasto eliminado");
                  invalidate();
                  if (dayDetailDate) {
                    qc.invalidateQueries({ queryKey: ["finanzas-day", dayDetailDate] });
                  }
                  setExpenseToDelete(null);
                } catch {
                  toast.error("No se pudo eliminar");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BalanceModal
        open={!!showBalanceModal}
        fund={showBalanceModal?.fund ?? "EFECTIVO"}
        defaultDate={from}
        onClose={() => setShowBalanceModal(null)}
        onSaved={() => { invalidate(); setShowBalanceModal(null); }}
      />

      <FundMovementModal
        open={showMovementModal}
        defaultDate={today}
        onClose={() => setShowMovementModal(false)}
        onSaved={() => { invalidate(); setShowMovementModal(false); }}
      />

      <AlertDialog open={!!movementToDelete} onOpenChange={(open) => !open && setMovementToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          {movementToDelete && (
            <div className="text-sm space-y-1 rounded-md border p-3 bg-muted/40">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-medium">{movementToDelete.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fondo</span>
                <span className="font-medium">{movementToDelete.fund}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-bold">{fmt(movementToDelete.amount)}</span>
              </div>
              {movementToDelete.description && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descripción</span>
                  <span className="font-medium">{movementToDelete.description}</span>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (ev) => {
                ev.preventDefault();
                if (!movementToDelete) return;
                try {
                  await deleteFundMovement(movementToDelete.id);
                  toast.success("Movimiento eliminado");
                  invalidate();
                  setMovementToDelete(null);
                } catch {
                  toast.error("No se pudo eliminar");
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettlementModal
        open={showSettlementModal}
        defaultDate={today}
        pendiente={capitalQ.data?.pendienteRendirRestaurante ?? 0}
        onClose={() => setShowSettlementModal(false)}
        onSaved={() => { invalidate(); setShowSettlementModal(false); }}
      />

      <SettlementReceiptModal
        open={!!settlementReceipt}
        onOpenChange={(v) => !v && setSettlementReceipt(null)}
        settlement={settlementReceipt}
      />

      <AlertDialog
        open={!!settlementToDelete}
        onOpenChange={(open) => !open && setSettlementToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta rendición?</AlertDialogTitle>
            <AlertDialogDescription>
              El monto vuelve al saldo del fondo y al pendiente de rendir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {settlementToDelete && (
            <div className="text-sm space-y-1 rounded-md border p-3 bg-muted/40">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha</span>
                <span className="font-medium">
                  {format(new Date(settlementToDelete.date + "T12:00:00"), "dd/MM/yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fondo</span>
                <span className="font-medium">{settlementToDelete.fund}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-bold text-destructive">{fmt(settlementToDelete.amount)}</span>
              </div>
              {settlementToDelete.notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notas</span>
                  <span className="font-medium">{settlementToDelete.notes}</span>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (ev) => {
                ev.preventDefault();
                if (!settlementToDelete) return;
                try {
                  await deleteSettlement(settlementToDelete.id);
                  toast.success("Rendición eliminada");
                  invalidate();
                  setSettlementToDelete(null);
                } catch {
                  toast.error("No se pudo eliminar");
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function RendicionCard({
  capital, loading, onRegistrar,
}: {
  capital?: CapitalSnapshot;
  loading: boolean;
  onRegistrar: () => void;
}) {
  const pendiente = capital?.pendienteRendirRestaurante ?? 0;
  const isPositive = pendiente > 0;

  return (
    <Card className={isPositive ? "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4" />
          Pendiente de rendir al restaurante
        </CardTitle>
        <CardDescription>
          Plata del restaurante que entró a tu caja y todavía no le devolviste al dueño.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Pendiente acumulado (histórico)</p>
            <p className={`text-2xl font-bold tabular-nums ${isPositive ? "text-amber-700 dark:text-amber-400" : "text-emerald-600"}`}>
              {loading ? "…" : fmt(pendiente)}
            </p>
          </div>
          <Button onClick={onRegistrar}>
            <Plus className="h-4 w-4 mr-1" />
            Registrar rendición
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyFinanceState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Wallet className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">Todavía no hay movimientos en este período</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1">
        Cuando registres ventas y gastos, vas a ver acá la rentabilidad del negocio.
      </p>
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, highlight, positive, negative, isCount,
}: {
  label: string; value: number; icon?: any;
  highlight?: boolean; positive?: boolean; negative?: boolean; isCount?: boolean;
}) {
  let valueColor = "text-foreground";
  if (highlight && positive !== undefined) {
    valueColor = positive ? "text-emerald-600" : "text-destructive";
  } else if (negative) {
    valueColor = "text-destructive";
  } else if (positive !== undefined) {
    valueColor = positive ? "text-emerald-600" : "text-destructive";
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-bold ${valueColor}`}>{isCount ? value.toLocaleString("es-AR") : fmt(value)}</p>
      </CardContent>
    </Card>
  );
}

function WaterfallCard({
  bruto, comisionesCliente, cogs, margenBruto, gastos, ganancia, periodLabel,
}: {
  bruto: number; comisionesCliente: number; cogs: number;
  margenBruto: number; gastos: number; ganancia: number; periodLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cómo se forma tu ganancia</CardTitle>
        <CardDescription>Resumen — {periodLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <WaterfallRow label="Ingreso del local" value={bruto} type="base" />
        <WaterfallRow label="Costo mercadería" value={cogs} type="subtract" />
        <WaterfallRow label="Margen bruto" value={margenBruto} type="subtotal" />
        <WaterfallRow label="Gastos operativos" value={gastos} type="subtract" />
        <WaterfallRow label="Ganancia neta" value={ganancia} type="result" />
        {comisionesCliente > 0 && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Recargos cobrados al cliente (procesador): {fmt(comisionesCliente)} · No es ingreso del local.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WaterfallRow({
  label, value, type,
}: {
  label: string; value: number;
  type: "base" | "subtract" | "subtotal" | "result";
}) {
  const isResult = type === "result";
  const isSubtotal = type === "subtotal";
  const isSubtract = type === "subtract";

  let textColor = "text-foreground";
  let valueDisplay = fmt(value);

  if (isSubtract) {
    textColor = "text-destructive/80";
    valueDisplay = value > 0 ? `−${fmt(value)}` : "—";
  } else if (isSubtotal) {
    textColor = value >= 0 ? "text-foreground" : "text-destructive";
  } else if (isResult) {
    textColor = value >= 0 ? "text-emerald-600" : "text-destructive";
  }

  return (
    <div className={`flex justify-between items-center text-sm py-1 ${isResult ? "border-t-2 pt-2 mt-1" : isSubtotal ? "border-t pt-1" : ""}`}>
      <span className={`flex items-center gap-1.5 ${isResult || isSubtotal ? "font-semibold" : ""}`}>
        {isSubtract && <Minus className="h-3 w-3" />}
        {isResult && <Equal className="h-3 w-3" />}
        {isSubtotal && <ArrowRight className="h-3 w-3" />}
        {label}
      </span>
      <span className={`font-medium ${textColor} ${isResult ? "text-lg font-bold" : ""}`}>
        {valueDisplay}
      </span>
    </div>
  );
}

function DailyTable({ rows, onDayClick }: { rows: DayRow[]; onDayClick: (date: string) => void }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Día</TableHead>
            <TableHead className="text-right">Ingreso local</TableHead>
            <TableHead className="text-right">Costo merc.</TableHead>
            <TableHead className="text-right">Gastos</TableHead>
            <TableHead className="text-right">Ganancia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.date} className="cursor-pointer hover:bg-muted/50" onClick={() => onDayClick(r.date)}>
              <TableCell>
                {format(new Date(r.date + "T12:00:00"), "EEE dd/MM", { locale: es })}
              </TableCell>
              <TableCell className="text-right">{fmt(r.bruto)}</TableCell>
              <TableCell className="text-right text-destructive/80">
                {r.cogs > 0 ? `−${fmt(r.cogs)}` : "—"}
              </TableCell>
              <TableCell className="text-right text-destructive/80">
                {r.gastos > 0 ? `−${fmt(r.gastos)}` : "—"}
              </TableCell>
              <TableCell className={`text-right font-medium ${r.ganancia >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {fmt(r.ganancia)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DayDetailDialog({
  date,
  data,
  sales,
  salesLoading,
  loading,
  onClose,
  onDeleteExpense,
  onSelectSale,
}: {
  date: string | null;
  data?: DayDetail;
  sales: SaleSummary[];
  salesLoading: boolean;
  loading: boolean;
  onClose: () => void;
  onDeleteExpense: (expense: Expense) => void;
  onSelectSale: (saleId: string) => void;
}) {
  if (!date) return null;
  const totalGastos = data?.expenses.reduce((s, e) => s + e.amount, 0) ?? 0;
  const ganancia = data ? data.bruto - data.cogs - totalGastos : 0;

  return (
    <Dialog open={!!date} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle — {format(new Date(date + "T12:00:00"), "EEEE dd/MM/yyyy", { locale: es })}</DialogTitle>
          <DialogDescription>Desglose financiero del día</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Tickets</p>
                <p className="font-bold text-lg">{data.ticketCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ingreso del local</p>
                <p className="font-bold text-lg text-emerald-600">{fmt(data.bruto)}</p>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ingreso del local</span>
                <span className="font-medium">{fmt(data.bruto)}</span>
              </div>
              {data.cogs > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costo mercadería</span>
                  <span className="text-destructive font-medium">−{fmt(data.cogs)}</span>
                </div>
              )}
              {totalGastos > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gastos operativos</span>
                  <span className="text-destructive font-medium">−{fmt(totalGastos)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 border-double">
                <span className="font-semibold">Ganancia neta</span>
                <span className={`font-bold ${ganancia >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(ganancia)}</span>
              </div>
              {data.comisionesCliente > 0 && (
                <p className="text-xs text-muted-foreground pt-1 border-t">
                  Recargos cobrados al cliente (procesador): {fmt(data.comisionesCliente)} · No es ingreso del local.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Ventas del día</h4>
                <span className="text-xs text-muted-foreground">{sales.length} {sales.length === 1 ? "venta" : "ventas"}</span>
              </div>
              {salesLoading ? (
                <p className="text-sm text-muted-foreground">Cargando ventas…</p>
              ) : sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ventas con productos del bar este día.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-right">Ítems</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Margen</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((s) => (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => onSelectSale(s.id)}
                        >
                          <TableCell className="text-xs">{format(new Date(s.created_at), "HH:mm")}</TableCell>
                          <TableCell className="text-xs">{s.channel === "RESTAURANTE" ? "Local" : "Delivery"}</TableCell>
                          <TableCell className="text-right text-xs">{s.itemCount}</TableCell>
                          <TableCell className="text-right text-xs">{fmt(s.bruto)}</TableCell>
                          <TableCell className={`text-right text-xs font-medium ${s.margen >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                            {fmt(s.margen)}
                          </TableCell>
                          <TableCell className="text-right">
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Gastos operativos</h4>
              {data.expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin gastos.</p>
              ) : (
                <div className="space-y-2">
                  {data.expenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                      <div>
                        <p className="font-medium">{e.category}</p>
                        <p className="text-xs text-muted-foreground">{e.description} — {e.payment_method}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-destructive">{fmt(e.amount)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteExpense(e)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("EFECTIVO");
  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: allCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
  });
  const categories = useMemo(() => allCategories.filter((c) => c.is_active), [allCategories]);

  // Default: primera categoría activa al abrir el modal o cambiar la lista.
  useEffect(() => {
    if (open && categories.length > 0 && !categories.find((c) => c.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [open, categories, categoryId]);

  const fund = computeFund(method);
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const isPassThrough = selectedCategory?.is_pass_through_default ?? false;

  const handleSave = async () => {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!selectedCategory) {
      toast.error("Elegí una categoría");
      return;
    }
    const amt = Math.round(parsed);
    setSaving(true);
    try {
      await createExpense({
        date,
        amount: amt,
        payment_method: method,
        category: selectedCategory.name,
        description,
        is_pass_through: selectedCategory.is_pass_through_default,
      });
      toast.success("Gasto registrado");
      setAmount("");
      setDescription("");
      onSaved();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription>
            {isPassThrough ? "Pass-through: no afecta Resultado, sí Capital." : "Gasto operativo: afecta Resultado y Capital."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Monto</Label>
            <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Medio de pago</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Fondo: {fund}</p>
          </div>
          <div>
            <Label>Categoría</Label>
            {categories.length === 0 ? (
              <p className="text-xs text-destructive mt-1">
                No hay categorías activas. Cargá alguna en Configuración → Gastos.
              </p>
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Elegir…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || categories.length === 0}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CAPITAL ─────────────────────────────────────────────────────────

const FUND_LABEL: Record<Fund, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "MercadoPago",
};

function fundIcon(fund: Fund) {
  return fund === "EFECTIVO" ? Banknote : Smartphone;
}

function CapitalTab({
  data, loading, onEditBalance, onAddMovement, onDeleteMovement, periodLabel,
}: {
  data?: CapitalSnapshot;
  loading: boolean;
  onEditBalance: (fund: Fund) => void;
  onAddMovement: () => void;
  onDeleteMovement: (m: FundMovement) => void;
  periodLabel: string;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data) return null;

  const totalEsperado = data.funds.reduce((s, f) => s + f.esperado, 0);
  const pendiente = data.pendienteRendirRestaurante;
  const saldoPropio = totalEsperado - pendiente;

  return (
    <>
      {data.missingSaldoInicial.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Falta cargar el saldo inicial</AlertTitle>
          <AlertDescription>
            Cargá el saldo inicial de {data.missingSaldoInicial.map((f) => FUND_LABEL[f]).join(" y ")} para ver el capital esperado real.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.funds.map((f) => {
          const Icon = fundIcon(f.fund);
          return (
            <Card key={f.fund}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{FUND_LABEL[f.fund]} esperado</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className={`text-xl font-bold ${f.esperado >= 0 ? "text-foreground" : "text-destructive"}`}>{fmt(f.esperado)}</p>
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total esperado en caja</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmt(totalEsperado)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pendiente de rendir al restaurante */}
      <Card className={pendiente > 0 ? "border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" />
            Pendiente de rendir al restaurante
          </CardTitle>
          <CardDescription>
            Plata del restaurante que entró a tu caja y todavía no le devolviste al dueño. Para registrar un pago, andá a la tab <strong>Restaurante</strong> → "Registrar rendición".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total esperado en caja</span>
            <span className="font-medium tabular-nums">{fmt(totalEsperado)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">A rendir al restaurante</span>
            <span className="text-destructive font-medium tabular-nums">−{fmt(pendiente)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 border-double">
            <span className="font-semibold">Saldo propio del local</span>
            <span className={`font-bold tabular-nums ${saldoPropio >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {fmt(saldoPropio)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => onEditBalance("EFECTIVO")}>
          <Banknote className="h-4 w-4 mr-1" /> Saldo inicial Efectivo
        </Button>
        <Button size="sm" variant="outline" onClick={() => onEditBalance("MERCADOPAGO")}>
          <Smartphone className="h-4 w-4 mr-1" /> Saldo inicial MercadoPago
        </Button>
        <Button size="sm" onClick={onAddMovement}>
          <Plus className="h-4 w-4 mr-1" /> Agregar / Retirar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detalle por fondo — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fondo</TableHead>
                <TableHead className="text-right">Saldo inicial</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Gastos / Retiros</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.funds.map((f) => (
                <CapitalFundRowComponent key={f.fund} row={f} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimientos manuales del período</CardTitle>
          <CardDescription>Aportes del dueño, retiros, transferencias internas.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos en el rango.</p>
          ) : (
            <div className="space-y-2">
              {data.movements.map((m) => {
                const isIngreso = m.type === "INGRESO";
                const Icon = isIngreso ? ArrowUpCircle : ArrowDownCircle;
                return (
                  <div key={m.id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isIngreso ? "text-emerald-600" : "text-destructive"}`} />
                      <div>
                        <p className="font-medium">{m.type} · {m.fund}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(m.date + "T12:00:00"), "dd/MM/yyyy")}
                          {m.description ? ` — ${m.description}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isIngreso ? "text-emerald-600" : "text-destructive"}`}>
                        {isIngreso ? "+" : "−"}{fmt(m.amount)}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteMovement(m)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function CapitalFundRowComponent({ row }: { row: CapitalFundRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{FUND_LABEL[row.fund]}</TableCell>
      <TableCell className="text-right">{fmt(row.saldoInicial)}</TableCell>
      <TableCell className="text-right text-emerald-600">{fmt(row.entradas)}</TableCell>
      <TableCell className="text-right text-destructive">{fmt(row.salidas)}</TableCell>
      <TableCell className="text-right text-destructive">{fmt(row.compras)}</TableCell>
      <TableCell className={`text-right font-bold ${row.esperado >= 0 ? "" : "text-destructive"}`}>{fmt(row.esperado)}</TableCell>
    </TableRow>
  );
}

function BalanceModal({
  open, fund, defaultDate, onClose, onSaved,
}: {
  open: boolean;
  fund: Fund;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setAmount("");
      setNotes("");
    }
  }, [open, defaultDate]);

  const handleSave = async () => {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setSaving(true);
    try {
      await upsertOpeningBalance(date, fund, Math.round(parsed), notes);
      toast.success("Saldo inicial actualizado");
      onSaved();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Saldo inicial — {FUND_LABEL[fund]}</DialogTitle>
          <DialogDescription>
            Define el "punto de partida" del fondo en una fecha. El capital esperado se calcula sumando entradas y restando salidas a partir de este saldo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Monto</Label>
            <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FundMovementModal({
  open, defaultDate, onClose, onSaved,
}: {
  open: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [fund, setFund] = useState<Fund>("EFECTIVO");
  const [type, setType] = useState<"INGRESO" | "RETIRO">("INGRESO");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setFund("EFECTIVO");
      setType("INGRESO");
      setAmount("");
      setDescription("");
    }
  }, [open, defaultDate]);

  const handleSave = async () => {
    const parsed = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setSaving(true);
    try {
      await createFundMovement({
        date,
        fund,
        type,
        amount: Math.round(parsed),
        description,
      });
      toast.success("Movimiento registrado");
      onSaved();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Movimiento de fondo</DialogTitle>
          <DialogDescription>
            Aportes del dueño (INGRESO) o retiros de plata (RETIRO).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as "INGRESO" | "RETIRO")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INGRESO">Ingreso</SelectItem>
                  <SelectItem value="RETIRO">Retiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fondo</Label>
              <Select value={fund} onValueChange={(v) => setFund(v as Fund)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                  <SelectItem value="MERCADOPAGO">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Monto</Label>
            <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SALE DETAIL ─────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETED: "default",
  LAYAWAY: "secondary",
  CANCELLED: "destructive",
};

function SaleDetailDialog({
  saleId, data, loading, onClose,
}: {
  saleId: string | null;
  data: SaleDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!saleId) return null;

  return (
    <Dialog open={!!saleId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {loading || !data ? (
          <>
            <DialogHeader>
              <DialogTitle>Cargando venta…</DialogTitle>
              <DialogDescription className="sr-only">Cargando detalle de la venta</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Un momento…</p>
          </>
        ) : (
          <SaleDetailBody data={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaleDetailBody({ data }: { data: SaleDetail }) {
  const localItems = data.items.filter((i) => i.owner === "LOCAL");
  const restaurantItems = data.items.filter((i) => i.owner === "RESTAURANTE");
  const date = format(new Date(data.created_at), "dd/MM/yyyy HH:mm", { locale: es });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          <span>Venta #{data.id.slice(0, 8)}</span>
          <Badge variant={STATUS_VARIANT[data.status] ?? "outline"}>{data.status}</Badge>
        </DialogTitle>
        <DialogDescription>
          {date} · {data.channel === "RESTAURANTE" ? "Local" : "Delivery"} · Término: {data.price_term}
          {data.cashier_name_snapshot && ` · Cajero: ${data.cashier_name_snapshot}`}
        </DialogDescription>
      </DialogHeader>

      {/* ITEMS */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Ítems</h4>
        <div className="rounded-md border divide-y">
          {localItems.map((it) => {
            const isDiscount = it.item_type === "DISCOUNT" || it.line_total < 0;
            const isOffer = it.item_type === "OFFER";
            const marginColor = it.line_margin >= 0 ? "text-emerald-600" : "text-destructive";
            return (
              <div key={it.id} className="p-2 text-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isOffer && <Tag className="h-3 w-3 text-primary shrink-0" />}
                      <span className={`font-medium ${isDiscount ? "text-primary" : ""}`}>{it.name}</span>
                      <span className="text-muted-foreground text-xs">× {it.qty}</span>
                    </div>
                    {!isDiscount && (
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                        <span>Costo: {fmt(it.cost_total)}</span>
                        <span>Margen: <span className={`font-medium ${marginColor}`}>{fmt(it.line_margin)}</span></span>
                      </div>
                    )}
                  </div>
                  <span className={`font-semibold tabular-nums ${isDiscount ? "text-primary" : ""}`}>
                    {fmt(it.line_total)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {restaurantItems.length > 0 && (
          <p className="text-xs text-muted-foreground">
            + {restaurantItems.length} ítem{restaurantItems.length !== 1 ? "s" : ""} de restaurante (no se computan acá).
          </p>
        )}
      </section>

      {/* PAGOS */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Pagos</h4>
        <div className="rounded-md border divide-y">
          {data.payments.map((p) => (
            <div key={p.id} className="p-2 text-sm">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">
                    {p.payment_method}
                    {p.installments > 1 && <span className="text-muted-foreground font-normal"> ({p.installments} cuotas)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.commission_amount > 0 ? (
                      <span>
                        Comisión {p.commission_pct}%: <span className="text-destructive">−{fmt(p.commission_amount)}</span>
                        {" · "}
                        Neto: <span className="font-medium">{fmt(p.net_amount)}</span>
                      </span>
                    ) : (
                      <span>Sin comisión</span>
                    )}
                    {" · "}
                    → entró a <strong className="text-foreground">{p.fund}</strong>
                  </div>
                </div>
                <span className="font-semibold tabular-nums">{fmt(p.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* RESUMEN FINANCIERO */}
      <section className="rounded-md border-2 border-primary/20 p-3 space-y-1.5 bg-primary/5">
        <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
          <DollarSign className="h-4 w-4 text-primary" /> Resumen financiero
        </h4>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Ingreso del local</span>
          <span className="font-medium tabular-nums">{fmt(data.bruto)}</span>
        </div>
        {data.brutoRestaurante > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">A rendir al restaurante</span>
            <span className="font-medium tabular-nums">{fmt(data.brutoRestaurante)}</span>
          </div>
        )}
        {data.cogs > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Costo mercadería (COGS)</span>
            <span className="text-amber-600 dark:text-amber-500 font-medium tabular-nums">−{fmt(data.cogs)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm border-t pt-1 border-double">
          <span className="font-semibold">Margen del local</span>
          <span className={`font-bold tabular-nums ${data.margen >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {fmt(data.margen)}
          </span>
        </div>
        {data.comisionesCliente > 0 && (
          <p className="text-xs text-muted-foreground pt-1 border-t">
            Recargos cobrados al cliente (procesador): {fmt(data.comisionesCliente)} · No es ingreso del local.
          </p>
        )}
      </section>
    </>
  );
}
