import { supabase } from "@/integrations/supabase/client";

export interface DaySummary {
  totalCobrado: number;
  totalLocal: number;
  totalRestaurant: number;
  totalDeliveryFee: number;
}

export interface PaymentBreakdown {
  payment_method: string;
  fund: string;
  total: number;
}

export interface ProductLine {
  name: string;
  qty: number;
  total: number;
}

export interface SaleWithPayments {
  id: string;
  total: number;
  subtotal_restaurant: number;
  payments: { payment_method: string; amount: number }[];
}

export interface RestaurantPaymentEstimate {
  payment_method: string;
  estimated: number;
}

export async function fetchDaySummary(dateStr: string): Promise<DaySummary> {
  const from = `${dateStr}T00:00:00`;
  const to = `${dateStr}T23:59:59`;

  const { data, error } = await supabase
    .from("pos_sales")
    .select("total, subtotal_local, subtotal_restaurant, delivery_fee")
    .eq("status", "COMPLETED")
    .gte("created_at", from)
    .lte("created_at", to);

  if (error) throw error;

  const rows = data || [];
  return {
    totalCobrado: rows.reduce((s, r) => s + r.total, 0),
    totalLocal: rows.reduce((s, r) => s + r.subtotal_local + r.delivery_fee, 0),
    totalRestaurant: rows.reduce((s, r) => s + r.subtotal_restaurant, 0),
    totalDeliveryFee: rows.reduce((s, r) => s + r.delivery_fee, 0),
  };
}

export async function fetchPaymentBreakdown(dateStr: string): Promise<PaymentBreakdown[]> {
  const from = `${dateStr}T00:00:00`;
  const to = `${dateStr}T23:59:59`;

  // Get sale IDs for the day
  const { data: sales, error: sErr } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("status", "COMPLETED")
    .gte("created_at", from)
    .lte("created_at", to);

  if (sErr) throw sErr;
  if (!sales || sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);

  const { data: payments, error: pErr } = await supabase
    .from("pos_payments")
    .select("payment_method, fund, amount")
    .in("sale_id", saleIds);

  if (pErr) throw pErr;

  // Aggregate by payment_method+fund
  const map = new Map<string, PaymentBreakdown>();
  for (const p of payments || []) {
    const key = `${p.payment_method}|${p.fund}`;
    const existing = map.get(key);
    if (existing) {
      existing.total += p.amount;
    } else {
      map.set(key, { payment_method: p.payment_method, fund: p.fund, total: p.amount });
    }
  }
  return Array.from(map.values());
}

export async function fetchProductLines(dateStr: string, owner: "LOCAL" | "RESTAURANTE"): Promise<ProductLine[]> {
  const from = `${dateStr}T00:00:00`;
  const to = `${dateStr}T23:59:59`;

  const { data: sales, error: sErr } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("status", "COMPLETED")
    .gte("created_at", from)
    .lte("created_at", to);

  if (sErr) throw sErr;
  if (!sales || sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);

  const { data: items, error: iErr } = await supabase
    .from("pos_sale_items")
    .select("name_snapshot, variant_snapshot, qty, line_total")
    .eq("owner", owner)
    .in("sale_id", saleIds);

  if (iErr) throw iErr;

  const map = new Map<string, ProductLine>();
  for (const item of items || []) {
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
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function fetchRestaurantPaymentEstimates(dateStr: string): Promise<RestaurantPaymentEstimate[]> {
  const from = `${dateStr}T00:00:00`;
  const to = `${dateStr}T23:59:59`;

  const { data: sales, error: sErr } = await supabase
    .from("pos_sales")
    .select("id, total, subtotal_restaurant")
    .eq("status", "COMPLETED")
    .gte("created_at", from)
    .lte("created_at", to);

  if (sErr) throw sErr;
  if (!sales || sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);

  const { data: payments, error: pErr } = await supabase
    .from("pos_payments")
    .select("sale_id, payment_method, amount")
    .in("sale_id", saleIds);

  if (pErr) throw pErr;

  // For each sale, distribute restaurant share proportionally
  const methodTotals = new Map<string, number>();

  for (const sale of sales) {
    if (sale.subtotal_restaurant <= 0 || sale.total <= 0) continue;
    const salePayments = (payments || []).filter((p) => p.sale_id === sale.id);
    const ratio = sale.subtotal_restaurant / sale.total;

    let distributed = 0;
    for (let i = 0; i < salePayments.length; i++) {
      const p = salePayments[i];
      let share: number;
      if (i === salePayments.length - 1) {
        // Last payment gets remainder to avoid rounding issues
        share = Math.round(sale.subtotal_restaurant - distributed);
      } else {
        share = Math.round(p.amount * ratio);
      }
      distributed += share;
      methodTotals.set(p.payment_method, (methodTotals.get(p.payment_method) || 0) + share);
    }
  }

  return Array.from(methodTotals.entries())
    .map(([payment_method, estimated]) => ({ payment_method, estimated }))
    .sort((a, b) => b.estimated - a.estimated);
}
