import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Volume2, VolumeX, Radio, ChevronDown, CheckCircle2, Clock, Play } from "lucide-react";
import { format, startOfDay, subDays, subHours } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

type KitchenState = "PENDING" | "IN_PROGRESS" | "DELIVERED";

interface KitchenItem {
  id: string;
  name_snapshot: string;
  qty: number;
  notes: string;
  kitchen_state: KitchenState;
  started_at: string | null;
  delivered_at: string | null;
}

interface KitchenBatch {
  kitchen_batch_id: string;
  sent_at: string;
  started_at: string | null;
  items: KitchenItem[];
  batch_state: KitchenState;
}

interface KitchenTable {
  sale_id: string;
  tab_name: string | null;
  channel: string;
  sale_status: string;
  batches: KitchenBatch[];
  has_pending: boolean;
}

type UndoEntry = { id: string; prevState: KitchenState };

const PAGE_SIZE = 30;

function shortId(uuid: string) {
  return uuid.slice(-6).toUpperCase();
}

function deriveBatchState(items: KitchenItem[]): KitchenState {
  if (items.every((i) => i.kitchen_state === "DELIVERED")) return "DELIVERED";
  if (items.some((i) => i.kitchen_state === "IN_PROGRESS" || i.kitchen_state === "DELIVERED")) return "IN_PROGRESS";
  return "PENDING";
}

function minStartedAt(items: KitchenItem[]): string | null {
  let min: string | null = null;
  for (const i of items) {
    if (!i.started_at) continue;
    if (!min || i.started_at < min) min = i.started_at;
  }
  return min;
}

function relMin(from: string | null): string {
  if (!from) return "";
  const min = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `hace ${h}h` : `hace ${h}h ${m}min`;
}

export default function Cocina() {
  const [tables, setTables] = useState<KitchenTable[]>([]);
  const [timeRange, setTimeRange] = useState<"2h" | "today" | "yesterday">("today");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "delivered" | "closed">("all");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const knownBatchIds = useRef<Set<string>>(new Set());
  const tablesRef = useRef<KitchenTable[]>([]);

  useEffect(() => { tablesRef.current = tables; }, [tables]);

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 200);
    } catch { /* ignore */ }
  }, [soundEnabled]);

  // Patch optimista: aplica una funcion de transformacion a cada item, y recalcula batch_state + has_pending.
  const patchTables = useCallback((transform: (item: KitchenItem) => KitchenItem) => {
    setTables((prev) =>
      prev.map((t) => {
        const newBatches = t.batches.map((b) => {
          const newItems = b.items.map(transform);
          return {
            ...b,
            items: newItems,
            batch_state: deriveBatchState(newItems),
            started_at: minStartedAt(newItems),
          };
        });
        return {
          ...t,
          batches: newBatches,
          has_pending: newBatches.some((b) => b.batch_state !== "DELIVERED"),
        };
      })
    );
  }, []);

  const undoDelivery = useCallback(async (snapshot: UndoEntry[]) => {
    if (snapshot.length === 0) return;
    // Patch optimista primero (UI snappy)
    const byIdPrev = new Map(snapshot.map((e) => [e.id, e.prevState]));
    patchTables((item) =>
      byIdPrev.has(item.id)
        ? { ...item, kitchen_state: byIdPrev.get(item.id)!, delivered_at: null }
        : item
    );
    // Agrupar por prevState para minimizar round-trips
    const byState = new Map<KitchenState, string[]>();
    for (const e of snapshot) {
      if (!byState.has(e.prevState)) byState.set(e.prevState, []);
      byState.get(e.prevState)!.push(e.id);
    }
    for (const [state, ids] of byState) {
      const { error } = await supabase
        .from("pos_sale_items")
        .update({ kitchen_state: state, delivered_at: null })
        .in("id", ids);
      if (error) {
        toast.error("Error al deshacer");
        return;
      }
    }
  }, [patchTables]);

  const showUndoToast = useCallback((snapshot: UndoEntry[]) => {
    if (snapshot.length === 0) return;
    toast.success("Entregado", {
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => undoDelivery(snapshot),
      },
    });
  }, [undoDelivery]);

  const markItemDelivered = useCallback(async (itemId: string) => {
    // Snapshot del estado previo
    let prevState: KitchenState = "PENDING";
    for (const t of tablesRef.current) {
      for (const b of t.batches) {
        const it = b.items.find((i) => i.id === itemId);
        if (it) { prevState = it.kitchen_state; break; }
      }
    }
    const { error } = await supabase
      .from("pos_sale_items")
      .update({ kitchen_state: "DELIVERED", delivered_at: new Date().toISOString() })
      .eq("id", itemId);
    if (error) {
      toast.error("Error al marcar como entregado");
      return;
    }
    patchTables((item) =>
      item.id === itemId
        ? { ...item, kitchen_state: "DELIVERED" as KitchenState, delivered_at: new Date().toISOString() }
        : item
    );
    showUndoToast([{ id: itemId, prevState }]);
  }, [patchTables, showUndoToast]);

  const markBatchDelivered = useCallback(async (saleId: string, batchId: string) => {
    // Snapshot: solo items del batch que NO estan ya DELIVERED.
    const snapshot: UndoEntry[] = [];
    for (const t of tablesRef.current) {
      if (t.sale_id !== saleId) continue;
      const batch = t.batches.find((b) => b.kitchen_batch_id === batchId);
      if (!batch) break;
      for (const it of batch.items) {
        if (it.kitchen_state !== "DELIVERED") {
          snapshot.push({ id: it.id, prevState: it.kitchen_state });
        }
      }
      break;
    }
    if (snapshot.length === 0) return;

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("pos_sale_items")
      .update({ kitchen_state: "DELIVERED", delivered_at: nowIso })
      .eq("sale_id", saleId)
      .eq("kitchen_batch_id", batchId)
      .neq("kitchen_state", "DELIVERED");
    if (error) {
      toast.error("Error al marcar comanda como entregada");
      return;
    }
    const idsToFlip = new Set(snapshot.map((e) => e.id));
    patchTables((item) =>
      idsToFlip.has(item.id)
        ? { ...item, kitchen_state: "DELIVERED" as KitchenState, delivered_at: nowIso }
        : item
    );
    showUndoToast(snapshot);
  }, [patchTables, showUndoToast]);

  const startBatch = useCallback(async (saleId: string, batchId: string) => {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("pos_sale_items")
      .update({ kitchen_state: "IN_PROGRESS", started_at: nowIso })
      .eq("sale_id", saleId)
      .eq("kitchen_batch_id", batchId)
      .eq("kitchen_state", "PENDING");
    if (error) {
      toast.error("Error al iniciar preparación");
      return;
    }
    // IDs del batch que estaban PENDING
    const flipIds = new Set<string>();
    for (const t of tablesRef.current) {
      if (t.sale_id !== saleId) continue;
      const batch = t.batches.find((b) => b.kitchen_batch_id === batchId);
      if (!batch) break;
      for (const it of batch.items) {
        if (it.kitchen_state === "PENDING") flipIds.add(it.id);
      }
      break;
    }
    patchTables((item) =>
      flipIds.has(item.id)
        ? { ...item, kitchen_state: "IN_PROGRESS" as KitchenState, started_at: nowIso }
        : item
    );
  }, [patchTables]);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const from = timeRange === "2h"
      ? subHours(now, 2).toISOString()
      : timeRange === "yesterday"
        ? startOfDay(subDays(now, 1)).toISOString()
        : startOfDay(now).toISOString();

    const { data: items, error: ie } = await supabase
      .from("pos_sale_items")
      .select("id, sale_id, name_snapshot, qty, notes, sent_at, kitchen_batch_id, kitchen_state, started_at, delivered_at")
      .eq("owner", "RESTAURANTE")
      .eq("sent_to_kitchen", true)
      .gte("sent_at", from)
      .order("sent_at", { ascending: false })
      .limit(500);

    if (ie || !items?.length) {
      setTables([]);
      setLoading(false);
      return;
    }

    const saleIds = [...new Set(items.map((i) => i.sale_id))];
    const { data: sales, error: se } = await supabase
      .from("pos_sales")
      .select("id, channel, status, tab_name")
      .in("id", saleIds);

    if (se) { setLoading(false); return; }

    const saleMap: Record<string, any> = {};
    for (const s of sales ?? []) saleMap[s.id] = s;

    // Group by sale_id -> batches
    const tableMap: Record<string, { sale: any; batchMap: Record<string, { items: KitchenItem[]; sentAt: string }> }> = {};
    const allBatchKeys = new Set<string>();

    for (const it of items) {
      const sale = saleMap[it.sale_id];
      if (!sale) continue;
      const batchId = it.kitchen_batch_id ?? "legacy";
      const batchKey = `${it.sale_id}::${batchId}`;
      allBatchKeys.add(batchKey);

      if (!tableMap[it.sale_id]) {
        tableMap[it.sale_id] = { sale, batchMap: {} };
      }
      if (!tableMap[it.sale_id].batchMap[batchId]) {
        tableMap[it.sale_id].batchMap[batchId] = { items: [], sentAt: it.sent_at ?? "" };
      }
      const batch = tableMap[it.sale_id].batchMap[batchId];
      const rawState = (it.kitchen_state ?? "PENDING") as KitchenState;
      batch.items.push({
        id: it.id,
        name_snapshot: it.name_snapshot,
        qty: it.qty,
        notes: it.notes,
        kitchen_state: rawState === "PENDING" || rawState === "IN_PROGRESS" || rawState === "DELIVERED" ? rawState : "PENDING",
        started_at: it.started_at ?? null,
        delivered_at: it.delivered_at ?? null,
      });
      if (it.sent_at && (!batch.sentAt || it.sent_at < batch.sentAt)) {
        batch.sentAt = it.sent_at;
      }
    }

    const stateOrder: Record<KitchenState, number> = { PENDING: 0, IN_PROGRESS: 1, DELIVERED: 2 };

    const result: KitchenTable[] = Object.entries(tableMap).map(([saleId, { sale, batchMap }]) => {
      const batches: KitchenBatch[] = Object.entries(batchMap)
        .map(([batchId, val]) => ({
          kitchen_batch_id: batchId,
          sent_at: val.sentAt,
          started_at: minStartedAt(val.items),
          items: val.items,
          batch_state: deriveBatchState(val.items),
        }))
        // Newest batches first, sorted by state priority (PENDING -> IN_PROGRESS -> DELIVERED)
        .sort((a, b) => {
          if (a.batch_state !== b.batch_state) return stateOrder[a.batch_state] - stateOrder[b.batch_state];
          return new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime();
        });

      return {
        sale_id: saleId,
        tab_name: sale.tab_name,
        channel: sale.channel,
        sale_status: sale.status,
        batches,
        has_pending: batches.some((b) => b.batch_state !== "DELIVERED"),
      };
    })
    // Priority sort: 1) pending, 2) all delivered but open, 3) closed
    .sort((a, b) => {
      const priority = (t: KitchenTable) => {
        const isClosed = t.sale_status === "COMPLETED" || t.sale_status === "CANCELLED";
        if (isClosed) return 3;
        if (!t.has_pending) return 2;
        return 1;
      };
      const pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      // Within same priority, newest first
      const aTime = a.batches[0]?.sent_at ?? "";
      const bTime = b.batches[0]?.sent_at ?? "";
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    // Beep on new batches
    const prevIds = knownBatchIds.current;
    if (prevIds.size > 0) {
      for (const id of allBatchKeys) {
        if (!prevIds.has(id)) { playBeep(); break; }
      }
    }
    knownBatchIds.current = allBatchKeys;

    setTables(result);
    setLoading(false);
  }, [timeRange, playBeep]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_sale_items" }, async (payload) => {
        const item = payload.new as any;
        if (!item?.sent_to_kitchen || item?.owner !== "RESTAURANTE") return;
        // Guard: si el UPDATE coincide con lo que ya tenemos local (probablemente nuestro propio echo),
        // skip para no re-fetchear toda la tabla.
        if (payload.eventType === "UPDATE" && item?.id) {
          let local: KitchenItem | undefined;
          for (const t of tablesRef.current) {
            for (const b of t.batches) {
              const found = b.items.find((i) => i.id === item.id);
              if (found) { local = found; break; }
            }
            if (local) break;
          }
          if (local
            && local.kitchen_state === item.kitchen_state
            && (local.delivered_at ?? null) === (item.delivered_at ?? null)
            && (local.started_at ?? null) === (item.started_at ?? null)) {
            return;
          }
        }
        await fetchData();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pos_sales" }, async (payload) => {
        const sale = payload.new as any;
        if (sale?.status === "COMPLETED" || sale?.status === "CANCELLED") {
          await fetchData();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => setTables((t) => [...t]), 60_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    let result = tables;
    if (statusFilter === "pending") {
      result = result.filter((t) => t.has_pending && t.sale_status === "OPEN");
    } else if (statusFilter === "delivered") {
      result = result.filter((t) => !t.has_pending && t.sale_status === "OPEN");
    } else if (statusFilter === "closed") {
      result = result.filter((t) => t.sale_status === "COMPLETED" || t.sale_status === "CANCELLED");
    }
    return result;
  }, [tables, statusFilter]);

  const counts = useMemo(() => {
    const pending = tables.filter((t) => t.has_pending && t.sale_status === "OPEN").length;
    const delivered = tables.filter((t) => !t.has_pending && t.sale_status === "OPEN").length;
    const closed = tables.filter((t) => t.sale_status === "COMPLETED" || t.sale_status === "CANCELLED").length;
    return { all: tables.length, pending, delivered, closed };
  }, [tables]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Cocina</h1>
          <Badge variant="outline" className="gap-1 sm:gap-1.5 text-emerald-600 border-emerald-300 bg-emerald-50 text-xs">
            <Radio className="h-3 w-3 animate-pulse" />
            En vivo
          </Badge>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? "Silenciar" : "Activar sonido"}>
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        {/* Time range */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5 w-fit">
          {([["2h", "2h"], ["today", "Hoy"], ["yesterday", "Ayer"]] as const).map(([val, label]) => (
            <Button
              key={val}
              variant={timeRange === val ? "default" : "ghost"}
              size="sm"
              className="h-8 sm:h-7 text-xs px-3"
              onClick={() => setTimeRange(val)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Status filters - horizontal scroll on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {([
            ["all", `Todos (${counts.all})`, ""],
            ["pending", `🔥 ${counts.pending}`, "text-amber-700"],
            ["delivered", `✅ ${counts.delivered}`, "text-emerald-700"],
            ["closed", `💰 ${counts.closed}`, "text-blue-700"],
          ] as const).map(([val, label, textCls]) => (
            <Button
              key={val}
              variant={statusFilter === val ? "default" : "outline"}
              size="sm"
              className={`h-9 sm:h-8 text-xs px-3 shrink-0 ${statusFilter !== val ? textCls : ""}`}
              onClick={() => setStatusFilter(val as any)}
            >
              {label}
            </Button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-2 sm:p-4">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Cargando pedidos…</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Sin pedidos de cocina por el momento.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((table) => {
                const displayName = table.tab_name || `Cuenta #${shortId(table.sale_id)}`;
                const allDone = !table.has_pending;
                const isClosed = table.sale_status === "COMPLETED" || table.sale_status === "CANCELLED";

                const cardClass = isClosed
                  ? table.sale_status === "CANCELLED"
                    ? "border-l-4 border-l-red-400 border-dashed opacity-70 bg-red-50/30"
                    : "border-l-4 border-l-blue-400 border-dashed opacity-70 bg-blue-50/30"
                  : allDone
                    ? "border-l-4 border-l-emerald-400 bg-emerald-50/50"
                    : "border-l-4 border-l-amber-400";

                return (
                  <Card
                    key={table.sale_id}
                    className={`transition-all ${cardClass}`}
                  >
                    <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6 flex flex-row items-center justify-between gap-2">
                      <span className="font-bold text-base sm:text-lg truncate">
                        {displayName}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isClosed ? (
                          table.sale_status === "CANCELLED" ? (
                            <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px] px-1.5 py-0">
                              CANCELADA
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px] px-1.5 py-0">
                              COBRADA
                            </Badge>
                          )
                        ) : allDone ? (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px] px-1.5 py-0">
                            TODO ENTREGADO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px] px-1.5 py-0">
                            ABIERTA
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
                      {table.batches.map((batch) => {
                        const sentTime = batch.sent_at ? format(new Date(batch.sent_at), "HH:mm", { locale: es }) : "";
                        const isNewBatch = batch.batch_state === "PENDING" && Date.now() - new Date(batch.sent_at).getTime() < 5 * 60 * 1000;

                        const batchClass = batch.batch_state === "DELIVERED"
                          ? "bg-muted/40 border-dashed opacity-60"
                          : batch.batch_state === "IN_PROGRESS"
                            ? "bg-blue-50/60 border-blue-300"
                            : isNewBatch
                              ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                              : "bg-background";

                        const timerColor = batch.batch_state === "PENDING"
                          ? "text-amber-700 font-semibold"
                          : batch.batch_state === "IN_PROGRESS"
                            ? "text-blue-700 font-semibold"
                            : "text-muted-foreground";

                        return (
                          <div
                            key={batch.kitchen_batch_id}
                            className={`rounded-md border p-2.5 space-y-1.5 ${batchClass}`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                {batch.batch_state === "DELIVERED" ? (
                                  <span className="text-muted-foreground">{sentTime}</span>
                                ) : batch.batch_state === "IN_PROGRESS" ? (
                                  <>
                                    <span className={timerColor}>{relMin(batch.started_at)}</span>
                                    <span className="text-muted-foreground text-[10px]">(entró {sentTime})</span>
                                  </>
                                ) : (
                                  <span className={timerColor}>{relMin(batch.sent_at)}</span>
                                )}
                                {isNewBatch && (
                                  <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0 ml-1">
                                    NUEVO
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {batch.batch_state === "PENDING" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 sm:h-7 text-xs text-blue-700 border-blue-300 hover:bg-blue-50 px-3"
                                    onClick={() => startBatch(table.sale_id, batch.kitchen_batch_id)}
                                  >
                                    <Play className="h-3.5 w-3.5 mr-1" />
                                    Empezar
                                  </Button>
                                )}
                                {batch.batch_state !== "DELIVERED" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 sm:h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 px-3"
                                    onClick={() => markBatchDelivered(table.sale_id, batch.kitchen_batch_id)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                    Todo
                                  </Button>
                                )}
                              </div>
                            </div>

                            {batch.items.map((item) => {
                              const done = item.kitchen_state === "DELIVERED";
                              return (
                                <div key={item.id} className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-medium text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
                                      {item.qty}x {item.name_snapshot}
                                    </p>
                                    {item.notes && (
                                      <div className={`mt-1 mb-1 rounded border border-red-300 bg-red-50 px-2 py-1 ${done ? "opacity-50" : ""}`}>
                                        <p className="text-xs font-bold text-red-900 break-words whitespace-pre-wrap">
                                          {item.notes}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  {!done && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-9 sm:h-7 w-9 sm:w-auto px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 shrink-0"
                                      onClick={() => markItemDelivered(item.id)}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {filtered.length > visibleCount && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                  <ChevronDown className="h-4 w-4 mr-1" /> Cargar más
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
