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

  const { data: sales, error } = await supabase
    .from("pos_sales")
    .select("id, total, subtotal_local, subtotal_restaurant, delivery_fee")
    .eq("status", "COMPLETED")
    .gte("created_at", from)
    .lte("created_at", to);

  if (error) throw error;
  const rows = sales || [];

  // Comisiones del día — se restan del total cobrado (lo que realmente entró).
  let totalComisiones = 0;
  if (rows.length > 0) {
    const { data: payments } = await supabase
      .from("pos_payments")
      .select("commission_amount")
      .in("sale_id", rows.map((r) => r.id));
    for (const p of payments || []) {
      totalComisiones += p.commission_amount ?? 0;
    }
  }

  return {
    // totalCobrado = bruto − comisiones = lo que realmente entró a caja/MP.
    totalCobrado: rows.reduce((s, r) => s + r.total, 0) - totalComisiones,
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
    .select("payment_method, fund, amount, commission_amount")
    .in("sale_id", saleIds);

  if (pErr) throw pErr;

  // Mostramos NETO: lo que efectivamente entró por cada método/fondo.
  // Efectivo no tiene comisión; tarjeta/QR/transferencia se acreditan netas.
  const map = new Map<string, PaymentBreakdown>();
  for (const p of payments || []) {
    const net = p.amount - (p.commission_amount ?? 0);
    const key = `${p.payment_method}|${p.fund}`;
    const existing = map.get(key);
    if (existing) {
      existing.total += net;
    } else {
      map.set(key, { payment_method: p.payment_method, fund: p.fund, total: net });
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
    .select("sale_id, payment_method, amount, commission_amount")
    .in("sale_id", saleIds);

  if (pErr) throw pErr;

  // Para cada venta, prorrateamos el subtotal_restaurant entre los pagos NETOS
  // (sin recargo). La comida no lleva recargo del procesador, así que la cuota
  // del restaurante se calcula sobre lo que efectivamente entró.
  const methodTotals = new Map<string, number>();

  for (const sale of sales) {
    if (sale.subtotal_restaurant <= 0) continue;
    const salePayments = (payments || []).filter((p) => p.sale_id === sale.id);

    // Total neto de la venta = suma de (amount − commission) por pago.
    const netByPayment = salePayments.map((p) => ({
      payment_method: p.payment_method,
      net: p.amount - (p.commission_amount ?? 0),
    }));
    const saleNetTotal = netByPayment.reduce((s, p) => s + p.net, 0);
    if (saleNetTotal <= 0) continue;

    let distributed = 0;
    for (let i = 0; i < netByPayment.length; i++) {
      const p = netByPayment[i];
      let share: number;
      if (i === netByPayment.length - 1) {
        share = Math.round(sale.subtotal_restaurant - distributed);
      } else {
        share = Math.round((p.net / saleNetTotal) * sale.subtotal_restaurant);
      }
      distributed += share;
      methodTotals.set(p.payment_method, (methodTotals.get(p.payment_method) || 0) + share);
    }
  }

  return Array.from(methodTotals.entries())
    .map(([payment_method, estimated]) => ({ payment_method, estimated }))
    .sort((a, b) => b.estimated - a.estimated);
}
