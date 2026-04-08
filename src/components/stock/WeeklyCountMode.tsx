import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, Search, CheckCircle2, AlertTriangle, Save, Eye, Play, ClipboardCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { ProductType } from "@/lib/types";
import { fetchCategories } from "@/lib/supabase-store";
import {
  fetchSalesByDay,
  fetchSalesByProduct,
  fetchSalesByDayAndProduct,
  fetchCountForRange,
  createCount,
  fetchCountLines,
  saveDraft,
  applyCountAdjustments,
  closeCount,
  fetchLastClosedCount,
} from "@/lib/weekly-count-store";

const typeBadgeStyles: Record<string, string> = {
  BEBIDAS: "bg-sky-100 text-sky-800 border-sky-200",
  SNACKS: "bg-orange-100 text-orange-800 border-orange-200",
  CIGARRILLOS: "bg-violet-100 text-violet-800 border-violet-200",
};

const statusLabels: Record<string, { label: string; className: string }> = {
  none: { label: "Sin conteo", className: "bg-muted text-muted-foreground" },
  DRAFT: { label: "Pendiente", className: "bg-amber-100 text-amber-800 border-amber-200" },
  ADJUSTED: { label: "Ajustado", className: "bg-blue-100 text-blue-800 border-blue-200" },
  CLOSED: { label: "Validado ✅", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

const typeChips = [
  { label: "Todos", value: "all" },
  { label: "Bebidas", value: "BEBIDAS" },
  { label: "Snacks", value: "SNACKS" },
  { label: "Cigarrillos", value: "CIGARRILLOS" },
];

export function WeeklyCountMode() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(subDays(today, 6));
  const [endDate, setEndDate] = useState<Date>(today);
  const [rangeLoaded, setRangeLoaded] = useState(false);
  const [startStr, setStartStr] = useState(format(subDays(today, 6), "yyyy-MM-dd"));
  const [endStr, setEndStr] = useState(format(today, "yyyy-MM-dd"));

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Day detail
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Count inputs
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [previewDiffs, setPreviewDiffs] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [inputsInitialized, setInputsInitialized] = useState(false);

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const { data: lastClosed } = useQuery({
    queryKey: ["last-closed-count"],
    queryFn: fetchLastClosedCount,
  });

  const { data: allCounts = [] } = useQuery({
    queryKey: ["all-counts"],
    queryFn: async () => {
      const { data, error } = await (await import("@/integrations/supabase/client")).supabase
        .from("inventory_counts")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Data loaded on "Cargar rango"
  const { data: salesByDay = [], refetch: refetchSalesByDay } = useQuery({
    queryKey: ["sales-by-day", startStr, endStr],
    queryFn: () => fetchSalesByDay(startStr, endStr),
    enabled: rangeLoaded,
  });

  const { data: salesByProduct = [], refetch: refetchSalesByProduct } = useQuery({
    queryKey: ["sales-by-product", startStr, endStr],
    queryFn: () => fetchSalesByProduct(startStr, endStr),
    enabled: rangeLoaded,
  });

  const { data: countRecord, refetch: refetchCount } = useQuery({
    queryKey: ["count-for-range", startStr, endStr],
    queryFn: () => fetchCountForRange(startStr, endStr),
    enabled: rangeLoaded,
  });

  const { data: countLines = [], refetch: refetchLines } = useQuery({
    queryKey: ["count-lines", countRecord?.id],
    queryFn: () => fetchCountLines(countRecord!.id),
    enabled: !!countRecord?.id,
  });

  const { data: dayDetail = [] } = useQuery({
    queryKey: ["sales-day-detail", selectedDay],
    queryFn: () => fetchSalesByDayAndProduct(selectedDay!),
    enabled: !!selectedDay,
  });

  const handleLoadRange = () => {
    const s = format(startDate, "yyyy-MM-dd");
    const e = format(endDate, "yyyy-MM-dd");
    setStartStr(s);
    setEndStr(e);
    setRangeLoaded(true);
    setPreviewDiffs(null);
    setCountInputs({});
    setSelectedDay(null);
    setInputsInitialized(false);
  };

  const handleCreateCount = async () => {
    try {
      await createCount(startStr, endStr);
      refetchCount();
      toast({ title: "Conteo creado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Initialize inputs from existing lines (use useEffect to avoid render-cycle setState)
  // Reset inputsInitialized when range changes
  if (countLines.length > 0 && !inputsInitialized) {
    const inputs: Record<string, string> = {};
    for (const l of countLines) {
      if (l.counted_qty != null) inputs[l.id] = String(l.counted_qty);
    }
    setCountInputs(inputs);
    setInputsInitialized(true);
  }

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const linesToSave = countLines.map((l: any) => ({
        id: l.id,
        counted_qty: countInputs[l.id] !== undefined && countInputs[l.id] !== "" ? parseInt(countInputs[l.id]) : null,
      }));
      await saveDraft(countRecord!.id, linesToSave);
      await refetchLines();
      toast({ title: "Borrador guardado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handlePreview = () => {
    const diffs = countLines
      .filter((l: any) => countInputs[l.id] !== undefined && countInputs[l.id] !== "")
      .map((l: any) => {
        const counted = parseInt(countInputs[l.id]);
        const diff = counted - l.system_qty;
        return { ...l, counted_qty: counted, diff_qty: diff };
      })
      .filter((l: any) => l.diff_qty !== 0);
    setPreviewDiffs(diffs);
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      // Save draft first
      const linesToSave = countLines.map((l: any) => ({
        id: l.id,
        counted_qty: countInputs[l.id] !== undefined && countInputs[l.id] !== "" ? parseInt(countInputs[l.id]) : null,
      }));
      await saveDraft(countRecord!.id, linesToSave);
      await applyCountAdjustments(countRecord!.id, startStr, endStr);
      await refetchCount();
      await refetchLines();
      queryClient.invalidateQueries({ queryKey: ["products-with-stock"] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      setPreviewDiffs(null);
      toast({ title: "Ajustes aplicados" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setApplying(false);
  };

  const handleClose = async () => {
    // Check all lines have counted_qty
    const missing = countLines.filter((l: any) => {
      const val = countInputs[l.id];
      return val === undefined || val === "";
    });
    if (missing.length > 0) {
      toast({ title: "Faltan productos", description: `${missing.length} producto(s) sin conteo cargado.`, variant: "destructive" });
      return;
    }
    try {
      await closeCount(countRecord!.id);
      await refetchCount();
      queryClient.invalidateQueries({ queryKey: ["last-closed-count"] });
      toast({ title: "Período validado ✅" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Filtering helpers
  const filterItems = <T extends { type?: string; category?: string; name?: string; variant_label?: string }>(items: T[]) => {
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        const name = (item.name ?? "").toLowerCase();
        const variant = (item.variant_label ?? "").toLowerCase();
        if (!name.includes(term) && !variant.includes(term)) return false;
      }
      return true;
    });
  };

  const filteredSalesByProduct = filterItems(salesByProduct);
  const filteredCountLines = countLines.filter((l: any) => {
    const p = l.product;
    if (!p) return true;
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      if (!p.name.toLowerCase().includes(term) && !(p.variant_label ?? "").toLowerCase().includes(term)) return false;
    }
    return true;
  });

  const countStatus = countRecord?.status ?? "none";
  const isReadOnly = countStatus === "CLOSED";
  const sb = statusLabels[countStatus] ?? statusLabels.none;

  const hasAnyCounted = countLines.some((l: any) => {
    const val = countInputs[l.id];
    return val !== undefined && val !== "";
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        {lastClosed && (
          <p className="text-sm text-muted-foreground">
            Último conteo validado: {lastClosed.start_date} a {lastClosed.end_date}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-medium">Desde</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-sm font-medium">Hasta</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(endDate, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={handleLoadRange}>Cargar rango</Button>
          {rangeLoaded && (
            <Button variant="ghost" size="sm" onClick={() => setRangeLoaded(false)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Volver
            </Button>
          )}
          <Badge variant="outline" className={sb.className}>{sb.label}</Badge>
        </div>

        {rangeLoaded && !countRecord && (
          <Button variant="outline" onClick={handleCreateCount}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Crear conteo para este rango
          </Button>
        )}
      </div>

      {!rangeLoaded && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Conteos anteriores</CardTitle></CardHeader>
          <CardContent>
            {allCounts.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No hay conteos previos. Seleccioná un rango y hacé click en "Cargar rango".</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Desde</TableHead>
                    <TableHead>Hasta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCounts.map((c: any) => {
                    const st = statusLabels[c.status] ?? statusLabels.none;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{format(new Date(c.start_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{format(new Date(c.end_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell><Badge variant="outline" className={st.className}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => {
                            setStartDate(new Date(c.start_date + "T12:00:00"));
                            setEndDate(new Date(c.end_date + "T12:00:00"));
                            setStartStr(c.start_date);
                            setEndStr(c.end_date);
                            setRangeLoaded(true);
                            setPreviewDiffs(null);
                            setCountInputs({});
                            setSelectedDay(null);
                            setInputsInitialized(false);
                          }}>
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {rangeLoaded && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {typeChips.map((t) => (
              <Button key={t.value} size="sm" variant={typeFilter === t.value ? "default" : "outline"} onClick={() => setTypeFilter(t.value)}>
                {t.label}
              </Button>
            ))}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-[180px]" />
            </div>
          </div>

          {/* Sales section */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Vendido en el rango</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="by-day">
                <TabsList>
                  <TabsTrigger value="by-day">Por día</TabsTrigger>
                  <TabsTrigger value="by-product">Por producto</TabsTrigger>
                </TabsList>
                <TabsContent value="by-day">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Día</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesByDay.length === 0 && (
                        <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-4">Sin ventas</TableCell></TableRow>
                      )}
                      {salesByDay.map((d) => (
                        <TableRow key={d.date} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedDay(selectedDay === d.date ? null : d.date)}>
                          <TableCell>{format(new Date(d.date + "T12:00:00"), "EEEE dd/MM", { locale: es })}</TableCell>
                          <TableCell className="text-right font-mono">{d.units}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {selectedDay && (
                    <div className="mt-3 p-3 bg-muted/30 rounded-md">
                      <p className="text-sm font-medium mb-2">Detalle {format(new Date(selectedDay + "T12:00:00"), "EEEE dd/MM", { locale: es })}</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Unidades</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dayDetail.map((d: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{d.name} <span className="text-muted-foreground text-sm">{d.variant_label}</span></TableCell>
                              <TableCell><Badge variant="outline" className={typeBadgeStyles[d.type] ?? ""}>{d.type}</Badge></TableCell>
                              <TableCell className="text-right font-mono">{d.units}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="by-product">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSalesByProduct.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Sin ventas</TableCell></TableRow>
                      )}
                      {filteredSalesByProduct.map((p) => (
                        <TableRow key={p.product_id}>
                          <TableCell>{p.name} <span className="text-muted-foreground text-sm">{p.variant_label}</span></TableCell>
                          <TableCell><Badge variant="outline" className={typeBadgeStyles[p.type] ?? ""}>{p.type}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
                          <TableCell className="text-right font-mono">{p.units}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Physical count section */}
          {countRecord && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conteo físico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-center">Stock sistema</TableHead>
                      <TableHead className="text-center">Conteo real</TableHead>
                      <TableHead className="text-center">Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCountLines.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">Sin productos</TableCell></TableRow>
                    )}
                    {filteredCountLines.map((l: any) => {
                      const val = countInputs[l.id] ?? "";
                      const diff = val !== "" ? parseInt(val) - l.system_qty : null;
                      return (
                        <TableRow key={l.id}>
                          <TableCell>
                            <span className="font-medium">{l.product?.name}</span>{" "}
                            <span className="text-muted-foreground text-sm">{l.product?.variant_label}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={typeBadgeStyles[l.product?.type] ?? ""}>{l.product?.type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.product?.category}</TableCell>
                          <TableCell className="text-center font-mono">{l.system_qty}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="w-20 text-center mx-auto"
                              value={val}
                              onChange={(e) => setCountInputs({ ...countInputs, [l.id]: e.target.value })}
                              disabled={isReadOnly}
                              min={0}
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {diff != null && (
                              <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Preview diffs */}
                {previewDiffs && previewDiffs.length > 0 && (
                  <div className="p-3 bg-muted/30 rounded-md space-y-2">
                    <p className="text-sm font-medium">Resumen de ajustes ({previewDiffs.length} producto(s))</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-center">Sistema</TableHead>
                          <TableHead className="text-center">Conteo</TableHead>
                          <TableHead className="text-center">Diferencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewDiffs.map((d: any) => (
                          <TableRow key={d.id}>
                            <TableCell>{d.product?.name} {d.product?.variant_label}</TableCell>
                            <TableCell className="text-center font-mono">{d.system_qty}</TableCell>
                            <TableCell className="text-center font-mono">{d.counted_qty}</TableCell>
                            <TableCell className="text-center font-mono">
                              <span className={d.diff_qty > 0 ? "text-emerald-600" : "text-red-600"}>
                                {d.diff_qty > 0 ? `+${d.diff_qty}` : d.diff_qty}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {previewDiffs && previewDiffs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No hay diferencias entre el stock del sistema y el conteo.</p>
                )}

                {/* Actions */}
                {!isReadOnly && (
                  <div className="flex flex-wrap gap-2">
                    {countStatus === "DRAFT" && (
                      <>
                        <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
                          <Save className="mr-2 h-4 w-4" /> {saving ? "Guardando..." : "Guardar borrador"}
                        </Button>
                        <Button variant="outline" onClick={handlePreview} disabled={!hasAnyCounted}>
                          <Eye className="mr-2 h-4 w-4" /> Previsualizar ajustes
                        </Button>
                        <Button onClick={handleApply} disabled={applying || !hasAnyCounted}>
                          <Play className="mr-2 h-4 w-4" /> {applying ? "Aplicando..." : "Aplicar ajustes"}
                        </Button>
                      </>
                    )}
                    {countStatus === "ADJUSTED" && (
                      <Button onClick={handleClose} className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar como validado ✅
                      </Button>
                    )}
                  </div>
                )}

                {isReadOnly && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Este conteo fue validado el {countRecord?.closed_at ? format(new Date(countRecord.closed_at), "dd/MM/yyyy HH:mm") : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
