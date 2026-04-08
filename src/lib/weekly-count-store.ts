import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";

// ── Sales queries (from stock_movements type=SALE) ──

export async function fetchSalesByDay(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("qty, created_at, product_id, products(name, variant_label, type, category)")
    .eq("type", "SALE")
    .gte("created_at", startDate)
    .lt("created_at", format(addDays(new Date(endDate), 1), "yyyy-MM-dd"));
  if (error) throw error;

  const byDay = new Map<string, number>();
  for (const m of data ?? []) {
    const day = format(new Date(m.created_at), "yyyy-MM-dd");
    byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(m.qty));
  }
  return Array.from(byDay.entries())
    .map(([date, units]) => ({ date, units }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchSalesByProduct(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("qty, product_id, products(name, variant_label, type, category)")
    .eq("type", "SALE")
    .gte("created_at", startDate)
    .lt("created_at", format(addDays(new Date(endDate), 1), "yyyy-MM-dd"));
  if (error) throw error;

  const byProduct = new Map<string, { product_id: string; name: string; variant_label: string; type: string; category: string; units: number }>();
  for (const m of data ?? []) {
    const p = (m as any).products;
    const existing = byProduct.get(m.product_id) ?? {
      product_id: m.product_id,
      name: p?.name ?? "",
      variant_label: p?.variant_label ?? "",
      type: p?.type ?? "",
      category: p?.category ?? "",
      units: 0,
    };
    existing.units += Math.abs(m.qty);
    byProduct.set(m.product_id, existing);
  }
  return Array.from(byProduct.values()).sort((a, b) => b.units - a.units);
}

export async function fetchSalesByDayAndProduct(date: string) {
  const nextDay = format(addDays(new Date(date), 1), "yyyy-MM-dd");
  const { data, error } = await supabase
    .from("stock_movements")
    .select("qty, product_id, products(name, variant_label, type, category)")
    .eq("type", "SALE")
    .gte("created_at", date)
    .lt("created_at", nextDay);
  if (error) throw error;

  const byProduct = new Map<string, { name: string; variant_label: string; type: string; category: string; units: number }>();
  for (const m of data ?? []) {
    const p = (m as any).products;
    const key = m.product_id;
    const existing = byProduct.get(key) ?? {
      name: p?.name ?? "",
      variant_label: p?.variant_label ?? "",
      type: p?.type ?? "",
      category: p?.category ?? "",
      units: 0,
    };
    existing.units += Math.abs(m.qty);
    byProduct.set(key, existing);
  }
  return Array.from(byProduct.values()).sort((a, b) => b.units - a.units);
}

// ── Inventory count CRUD ──

export async function fetchCountForRange(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCount(startDate: string, endDate: string) {
  // Get active products with track_stock=true and their balances
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, stock_balances(qty_on_hand)")
    .eq("is_active", true)
    .eq("track_stock", true);
  if (pErr) throw pErr;

  const { data: count, error: cErr } = await supabase
    .from("inventory_counts")
    .insert({ start_date: startDate, end_date: endDate })
    .select()
    .single();
  if (cErr) throw cErr;

  const lines = (products ?? []).map((p: any) => {
    const sysQty = p.stock_balances?.qty_on_hand ?? 0;
    return {
      count_id: count.id,
      product_id: p.id,
      system_qty: sysQty,
      counted_qty: sysQty,
      diff_qty: 0,
    };
  });

  if (lines.length > 0) {
    const { error: lErr } = await supabase
      .from("inventory_count_lines")
      .insert(lines);
    if (lErr) throw lErr;
  }

  return count;
}

export async function fetchCountLines(countId: string) {
  const { data, error } = await supabase
    .from("inventory_count_lines")
    .select("*, products(name, variant_label, type, category)")
    .eq("count_id", countId);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    ...l,
    product: l.products,
    products: undefined,
  }));
}

export async function saveDraft(countId: string, lines: { id: string; counted_qty: number | null }[]) {
  for (const line of lines) {
    const diff = line.counted_qty != null ? line.counted_qty - 0 : null; // will be recalculated
    await supabase
      .from("inventory_count_lines")
      .update({ counted_qty: line.counted_qty })
      .eq("id", line.id);
  }
  // Recalculate diff_qty from system_qty
  const { data: updated } = await supabase
    .from("inventory_count_lines")
    .select("id, system_qty, counted_qty")
    .eq("count_id", countId);
  
  for (const l of updated ?? []) {
    const diff = l.counted_qty != null ? l.counted_qty - l.system_qty : null;
    await supabase
      .from("inventory_count_lines")
      .update({ diff_qty: diff })
      .eq("id", l.id);
  }
}

export async function applyCountAdjustments(countId: string, startDate: string, endDate: string) {
  const { data: lines, error } = await supabase
    .from("inventory_count_lines")
    .select("*")
    .eq("count_id", countId)
    .not("counted_qty", "is", null);
  if (error) throw error;

  const reason = `Conteo semanal ${startDate} a ${endDate}`;
  const movements: any[] = [];
  const balanceUpserts: any[] = [];

  for (const l of lines ?? []) {
    const diff = l.counted_qty! - l.system_qty;
    if (diff !== 0) {
      movements.push({
        product_id: l.product_id,
        type: "ADJUST",
        qty: diff,
        reason,
      });
    }
    balanceUpserts.push({
      product_id: l.product_id,
      qty_on_hand: l.counted_qty!,
    });
  }

  if (movements.length > 0) {
    const { error: mErr } = await supabase.from("stock_movements").insert(movements);
    if (mErr) throw mErr;
  }

  if (balanceUpserts.length > 0) {
    const { error: bErr } = await supabase
      .from("stock_balances")
      .upsert(balanceUpserts, { onConflict: "product_id" });
    if (bErr) throw bErr;
  }

  const { error: uErr } = await supabase
    .from("inventory_counts")
    .update({ status: "ADJUSTED", adjusted_at: new Date().toISOString() })
    .eq("id", countId);
  if (uErr) throw uErr;
}

export async function closeCount(countId: string) {
  const { error } = await supabase
    .from("inventory_counts")
    .update({ status: "CLOSED", closed_at: new Date().toISOString() })
    .eq("id", countId);
  if (error) throw error;
}

export async function fetchLastClosedCount() {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("status", "CLOSED")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
