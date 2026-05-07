import { supabase } from "@/integrations/supabase/client";
import type { Fund } from "./finanzas-store";
import { RENDICION_CATEGORY } from "./finanzas-store";
import { dayStart, dayEnd } from "./date-utils";

export interface SettlementDetailLine {
  name: string;
  qty: number;
  total: number;
}

export interface SettlementDetail {
  lines: SettlementDetailLine[];
  totalVendido: number;
  deliveryFee: number;
  ticketCount: number;
}

export interface RestaurantSettlement {
  id: string;
  date: string;
  amount: number;
  fund: Fund;
  notes: string | null;
  period_from: string | null;
  period_to: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchSettlementsRange(
  from: string,
  to: string,
): Promise<RestaurantSettlement[]> {
  const { data, error } = await supabase
    .from("restaurant_settlements")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RestaurantSettlement[];
}

export async function createSettlement(input: {
  date: string;
  amount: number;
  fund: Fund;
  notes: string;
  period_from?: string | null;
  period_to?: string | null;
}) {
  const { error } = await supabase.from("restaurant_settlements").insert({
    date: input.date,
    amount: input.amount,
    fund: input.fund,
    notes: input.notes || null,
    period_from: input.period_from ?? null,
    period_to: input.period_to ?? null,
  });
  if (error) throw error;
}

// Devuelve el período sugerido para una nueva rendición:
// desde el día siguiente al period_to de la última rendición (o a la fecha de la última si no tiene período),
// hasta hoy. Si nunca se rindió, devuelve null en `from`.
export async function fetchSuggestedPeriod(): Promise<{ from: string | null; to: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("restaurant_settlements")
    .select("date, period_to")
    .is("deleted_at", null)
    .order("period_to", { ascending: false, nullsFirst: false })
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { from: null, to: today };

  const lastDay = data.period_to ?? data.date;
  const next = new Date(lastDay + "T12:00:00");
  next.setDate(next.getDate() + 1);
  return { from: next.toISOString().slice(0, 10), to: today };
}

export async function deleteSettlement(id: string) {
  const { error } = await supabase
    .from("restaurant_settlements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// Detalle de lo vendido al restaurante en un rango — alimenta el recibo de rendición.
// Suma platos por nombre+variante (igual que fetchProductLines de cierre-store, pero por rango)
// y devuelve total + delivery_fee separados.
export async function fetchSettlementDetail(
  from: string,
  to: string,
): Promise<SettlementDetail> {
  const { data: sales, error: sErr } = await supabase
    .from("pos_sales")
    .select("id, subtotal_restaurant, delivery_fee")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(from))
    .lte("created_at", dayEnd(to));
  if (sErr) throw sErr;
  if (!sales || sales.length === 0) {
    return { lines: [], totalVendido: 0, deliveryFee: 0, ticketCount: 0 };
  }

  const restSales = sales.filter(
    (s) => (s.subtotal_restaurant ?? 0) + (s.delivery_fee ?? 0) > 0,
  );
  const saleIds = restSales.map((s) => s.id);
  if (saleIds.length === 0) {
    return { lines: [], totalVendido: 0, deliveryFee: 0, ticketCount: 0 };
  }

  const { data: items, error: iErr } = await supabase
    .from("pos_sale_items")
    .select("name_snapshot, variant_snapshot, qty, line_total")
    .eq("owner", "RESTAURANTE")
    .in("sale_id", saleIds);
  if (iErr) throw iErr;

  const map = new Map<string, SettlementDetailLine>();
  for (const item of items ?? []) {
    const name = item.variant_snapshot
      ? `${item.name_snapshot} ${item.variant_snapshot}`
      : item.name_snapshot;
    const existing = map.get(name);
    if (existing) {
      existing.qty += item.qty;
      existing.total += item.line_total;
    } else {
      map.set(name, { name, qty: item.qty, total: item.line_total });
    }
  }

  const totalVendido = restSales.reduce(
    (s, r) => s + (r.subtotal_restaurant ?? 0) + (r.delivery_fee ?? 0),
    0,
  );
  const deliveryFee = restSales.reduce((s, r) => s + (r.delivery_fee ?? 0), 0);

  return {
    lines: Array.from(map.values()).sort((a, b) => b.total - a.total),
    totalVendido,
    deliveryFee,
    ticketCount: restSales.length,
  };
}

// Suma histórica de lo rendido al restaurante hasta `toDate` inclusive.
// Combina la tabla nueva con los expenses pass-through legacy de la categoría
// reservada — ambos siguen siendo válidos durante la transición.
export async function fetchTotalSettledUntil(toDate: string): Promise<number> {
  const [newRes, legacyRes] = await Promise.all([
    supabase
      .from("restaurant_settlements")
      .select("amount")
      .lte("date", toDate)
      .is("deleted_at", null),
    supabase
      .from("expenses")
      .select("amount")
      .eq("category", RENDICION_CATEGORY)
      .eq("is_pass_through", true)
      .lte("date", toDate)
      .is("deleted_at", null),
  ]);
  if (newRes.error) throw newRes.error;
  if (legacyRes.error) throw legacyRes.error;

  const fromNew = (newRes.data ?? []).reduce((s, r) => s + r.amount, 0);
  const fromLegacy = (legacyRes.data ?? []).reduce((s, r) => s + r.amount, 0);
  return fromNew + fromLegacy;
}
