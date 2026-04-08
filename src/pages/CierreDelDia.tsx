import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, DollarSign, Truck, UtensilsCrossed, Store, Printer, ChevronDown, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RestaurantReceiptModal } from "@/components/cierre/RestaurantReceiptModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchDaySummary,
  fetchPaymentBreakdown,
  fetchProductLines,
  fetchRestaurantPaymentEstimates,
} from "@/lib/cierre-store";
import { createExpense, computeFund } from "@/lib/finanzas-store";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  QR: "QR",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
};

const FUND_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "MercadoPago",
};

export default function CierreDelDia() {
  const [date, setDate] = useState<Date>(new Date());
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [estimatesOpen, setEstimatesOpen] = useState(false);
  const [rendicionOpen, setRendicionOpen] = useState(false);
  const [rendicionMethod, setRendicionMethod] = useState("EFECTIVO");
  const [rendicionAmount, setRendicionAmount] = useState("");
  const [rendicionDesc, setRendicionDesc] = useState("");
  const [rendicionSaving, setRendicionSaving] = useState(false);
  const qc = useQueryClient();

  const dateStr = format(date, "yyyy-MM-dd");

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["cierre-summary", dateStr],
    queryFn: () => fetchDaySummary(dateStr),
  });

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ["cierre-payments", dateStr],
    queryFn: () => fetchPaymentBreakdown(dateStr),
  });

  const { data: localLines = [] } = useQuery({
    queryKey: ["cierre-local-lines", dateStr],
    queryFn: () => fetchProductLines(dateStr, "LOCAL"),
  });

  const { data: restaurantLines = [] } = useQuery({
    queryKey: ["cierre-restaurant-lines", dateStr],
    queryFn: () => fetchProductLines(dateStr, "RESTAURANTE"),
  });

  const { data: restEstimates = [] } = useQuery({
    queryKey: ["cierre-rest-estimates", dateStr],
    queryFn: () => fetchRestaurantPaymentEstimates(dateStr),
  });

  // Check if rendición already exists for this date
  const { data: existingRendicion } = useQuery({
    queryKey: ["cierre-rendicion-exists", dateStr],
    queryFn: async () => {
      const { data } = await (await import("@/integrations/supabase/client")).supabase
        .from("expenses")
        .select("id")
        .eq("date", dateStr)
        .eq("category", "Rendición restaurante")
        .limit(1);
      return (data?.length ?? 0) > 0;
    },
  });

  const rendicionDone = existingRendicion === true;

  // Aggregate payments by method and by fund
  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => map.set(p.payment_method, (map.get(p.payment_method) || 0) + p.total));
    return Array.from(map.entries()).map(([method, total]) => ({ method, total }));
  }, [payments]);

  const byFund = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) => map.set(p.fund, (map.get(p.fund) || 0) + p.total));
    return Array.from(map.entries()).map(([fund, total]) => ({ fund, total }));
  }, [payments]);

  const loading = loadingSummary || loadingPayments;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Cierre del Día</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, "dd MMM yyyy", { locale: es })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : !summary || summary.totalCobrado === 0 ? (
        <p className="text-muted-foreground text-center py-12">No hay ventas registradas para este día.</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-4 w-4" /> Total cobrado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(summary.totalCobrado)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Store className="h-4 w-4" /> Lo mío
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(summary.totalLocal)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <UtensilsCrossed className="h-4 w-4" /> Restaurante
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(summary.totalRestaurant)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Truck className="h-4 w-4" /> Envío
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(summary.totalDeliveryFee)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pagos del día</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Por método de pago</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {byMethod.map((m) => (
                    <div key={m.method} className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">{METHOD_LABELS[m.method] || m.method}</p>
                      <p className="text-lg font-semibold">{fmt(m.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Por fondo</p>
                <div className="grid grid-cols-2 gap-2">
                  {byFund.map((f) => (
                    <div key={f.fund} className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">{FUND_LABELS[f.fund] || f.fund}</p>
                      <p className="text-lg font-semibold">{fmt(f.total)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Local section */}
          {localLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Local (Lo mío)</span>
                  <span className="text-lg">{fmt(summary.totalLocal)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unid.</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localLines.map((l) => (
                      <TableRow key={l.name}>
                        <TableCell>{l.name}</TableCell>
                        <TableCell className="text-right">{l.qty}</TableCell>
                        <TableCell className="text-right">{fmt(l.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Restaurant section */}
          {restaurantLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Restaurante (Comida)</span>
                  <span className="text-lg">{fmt(summary.totalRestaurant)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plato</TableHead>
                      <TableHead className="text-right">Unid.</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {restaurantLines.map((l) => (
                      <TableRow key={l.name}>
                        <TableCell>{l.name}</TableCell>
                        <TableCell className="text-right">{l.qty}</TableCell>
                        <TableCell className="text-right">{fmt(l.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setReceiptOpen(true)}>
                    <Printer className="h-4 w-4 mr-2" /> Ver comprobante
                  </Button>
                  {rendicionDone ? (
                    <Button variant="outline" disabled>
                      <HandCoins className="h-4 w-4 mr-2" /> Rendición registrada ✓
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={() => {
                        setRendicionAmount(String(summary?.totalRestaurant || 0));
                        setRendicionDesc(`Rendición restaurante ${format(date, "dd/MM/yyyy")}`);
                        setRendicionOpen(true);
                      }}
                    >
                      <HandCoins className="h-4 w-4 mr-2" /> Registrar rendición
                    </Button>
                  )}
                </div>

                {/* Collapsible estimates */}
                {restEstimates.length > 0 && (
                  <Collapsible open={estimatesOpen} onOpenChange={setEstimatesOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                        <ChevronDown className={cn("h-3 w-3 mr-1 transition-transform", estimatesOpen && "rotate-180")} />
                        Distribución estimada por método de pago
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {restEstimates.map((e) => (
                          <div key={e.payment_method} className="rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">{METHOD_LABELS[e.payment_method] || e.payment_method}</p>
                            <p className="text-sm font-semibold">{fmt(e.estimated)}</p>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <RestaurantReceiptModal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        date={format(date, "dd/MM/yyyy")}
        items={restaurantLines}
        total={summary?.totalRestaurant || 0}
      />

      {/* Modal Rendición restaurante */}
      <Dialog open={rendicionOpen} onOpenChange={setRendicionOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar rendición restaurante</DialogTitle>
            <DialogDescription>Este gasto impacta en Capital (salida de fondo) pero NO en Resultado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto</Label>
              <Input type="number" value={rendicionAmount} onChange={(e) => setRendicionAmount(e.target.value)} />
            </div>
            <div>
              <Label>Medio de pago</Label>
              <Select value={rendicionMethod} onValueChange={setRendicionMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                  <SelectItem value="QR">QR</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                  <SelectItem value="TARJETA">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Fondo: {computeFund(rendicionMethod)}</p>
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={rendicionDesc} onChange={(e) => setRendicionDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRendicionOpen(false)}>Cancelar</Button>
            <Button
              disabled={rendicionSaving}
              onClick={async () => {
                const amt = parseInt(rendicionAmount);
                if (!amt || amt <= 0) { toast.error("Monto inválido"); return; }
                setRendicionSaving(true);
                try {
                  await createExpense({
                    date: dateStr,
                    amount: amt,
                    payment_method: rendicionMethod,
                    category: "Rendición restaurante",
                    description: rendicionDesc,
                  });
                  toast.success("Rendición registrada");
                  setRendicionOpen(false);
                  qc.invalidateQueries({ queryKey: ["finanzas-resultado"] });
                  qc.invalidateQueries({ queryKey: ["cierre-rendicion-exists", dateStr] });
                } catch {
                  toast.error("Error al registrar");
                } finally {
                  setRendicionSaving(false);
                }
              }}
            >
              {rendicionSaving ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
