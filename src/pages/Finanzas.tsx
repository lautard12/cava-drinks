import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign, Trash2, ChevronDown, Package, Receipt, Minus, Equal, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  computeFund,
  type DayRow,
  type DayDetail,
  type Expense,
} from "@/lib/finanzas-store";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

const CATEGORIES = [
  "Insumos",
  "Servicios",
  "Alquiler",
  "Sueldos",
  "Impuestos",
  "Rendición restaurante",
  "Otros",
];

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["finanzas-resultado"] });
    qc.invalidateQueries({ queryKey: ["finanzas-day"] });
    qc.invalidateQueries({ queryKey: ["finanzas-restaurante"] });
    qc.invalidateQueries({ queryKey: ["finanzas-gastos"] });
  };

  const rows = resultadoQ.data ?? [];
  const totalBruto = rows.reduce((s, r) => s + r.bruto, 0);
  const totalComisiones = rows.reduce((s, r) => s + r.comisiones, 0);
  const totalNeto = rows.reduce((s, r) => s + r.neto, 0);
  const totalCogs = rows.reduce((s, r) => s + r.cogs, 0);
  const totalGastos = rows.reduce((s, r) => s + r.gastos, 0);
  const totalGanancia = rows.reduce((s, r) => s + r.ganancia, 0);
  const totalMargenBruto = totalNeto - totalCogs;

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

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of allExpenses) {
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
                <KpiCard label="Ventas Brutas" value={totalBruto} icon={DollarSign} />
                <KpiCard label="Neto Cobrado" value={totalNeto} positive={totalNeto > 0} />
              </div>

              {/* Waterfall Card */}
              <WaterfallCard
                bruto={totalBruto}
                comisiones={totalComisiones}
                neto={totalNeto}
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
                      <span>Total</span>
                      <span className="text-destructive">{fmt(totalExpAmount)}</span>
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
                        <span className="font-medium">{g.period}</span>
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
                              onClick={async () => {
                                await deleteExpense(e.id);
                                toast.success("Gasto eliminado");
                                invalidate();
                              }}
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

        {/* ─── TAB RESTAURANTE ─── */}
        <TabsContent value="restaurante" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard label="Vendido restaurante" value={totalRestVendido} icon={UtensilsCrossed} />
            <KpiCard label="Tickets con comida" value={totalRestTickets} icon={UtensilsCrossed} isCount />
            <KpiCard label="Unidades vendidas" value={totalRestUnidades} icon={Package} isCount />
          </div>

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
                      <TableCell className="font-medium">{r.period}</TableCell>
                      <TableCell className="text-right">{r.tickets}</TableCell>
                      <TableCell className="text-right">{r.unidades}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.totalVendido)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── MODAL: Day Detail ─── */}
      <DayDetailDialog
        date={dayDetailDate}
        data={dayDetailQ.data}
        loading={dayDetailQ.isLoading}
        onClose={() => setDayDetailDate(null)}
        onDeleteExpense={async (id) => {
          await deleteExpense(id);
          toast.success("Gasto eliminado");
          invalidate();
          qc.invalidateQueries({ queryKey: ["finanzas-day", dayDetailDate] });
        }}
      />

      <ExpenseModal
        open={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        onSaved={() => {
          invalidate();
          setShowExpenseModal(false);
        }}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

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
  bruto, comisiones, neto, cogs, margenBruto, gastos, ganancia, periodLabel,
}: {
  bruto: number; comisiones: number; neto: number; cogs: number;
  margenBruto: number; gastos: number; ganancia: number; periodLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cómo se forma tu ganancia</CardTitle>
        <CardDescription>Resumen — {periodLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <WaterfallRow label="Ventas brutas" value={bruto} type="base" />
        <WaterfallRow label="Comisiones procesador" value={comisiones} type="subtract" />
        <WaterfallRow label="Neto cobrado" value={neto} type="subtotal" />
        <WaterfallRow label="Costo mercadería" value={cogs} type="subtract" />
        <WaterfallRow label="Margen bruto" value={margenBruto} type="subtotal" />
        <WaterfallRow label="Gastos operativos" value={gastos} type="subtract" />
        <WaterfallRow label="Ganancia neta" value={ganancia} type="result" />
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
            <TableHead className="text-right">Ventas</TableHead>
            <TableHead className="text-right">Comisiones</TableHead>
            <TableHead className="text-right">Neto cobrado</TableHead>
            <TableHead className="text-right">Costo merc.</TableHead>
            <TableHead className="text-right">Gastos</TableHead>
            <TableHead className="text-right">Ganancia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const neto = r.bruto - r.comisiones;
            return (
              <TableRow key={r.date} className="cursor-pointer hover:bg-muted/50" onClick={() => onDayClick(r.date)}>
                <TableCell>
                  {format(new Date(r.date + "T12:00:00"), "EEE dd/MM", { locale: es })}
                </TableCell>
                <TableCell className="text-right">{fmt(r.bruto)}</TableCell>
                <TableCell className="text-right text-destructive/80">
                  {r.comisiones > 0 ? `−${fmt(r.comisiones)}` : "—"}
                </TableCell>
                <TableCell className="text-right">{fmt(neto)}</TableCell>
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function DayDetailDialog({
  date,
  data,
  loading,
  onClose,
  onDeleteExpense,
}: {
  date: string | null;
  data?: DayDetail;
  loading: boolean;
  onClose: () => void;
  onDeleteExpense: (id: string) => void;
}) {
  if (!date) return null;
  const totalGastos = data?.expenses.reduce((s, e) => s + e.amount, 0) ?? 0;
  const neto = data ? data.bruto - data.comisiones : 0;
  const ganancia = data ? neto - data.cogs - totalGastos : 0;

  return (
    <Dialog open={!!date} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
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
                <p className="text-muted-foreground">Neto cobrado</p>
                <p className="font-bold text-lg text-emerald-600">{fmt(neto)}</p>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ventas brutas</span>
                <span className="font-medium">{fmt(data.bruto)}</span>
              </div>
              {data.comisiones > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comisiones procesador</span>
                  <span className="text-destructive font-medium">−{fmt(data.comisiones)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span className="font-medium">Neto cobrado</span>
                <span className="font-bold text-emerald-600">{fmt(neto)}</span>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteExpense(e.id)}>
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
  const [category, setCategory] = useState("Insumos");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const fund = computeFund(method);
  const isPassThrough = category === "Rendición restaurante";

  const handleSave = async () => {
    const amt = parseInt(amount);
    if (!amt || amt <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setSaving(true);
    try {
      await createExpense({ date, amount: amt, payment_method: method, category, description });
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
            {isPassThrough ? "Rendición: no afecta Resultado, sí Capital." : "Gasto operativo: afecta Resultado y Capital."}
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
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
