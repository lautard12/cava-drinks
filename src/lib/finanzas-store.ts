import { supabase } from "@/integrations/supabase/client";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { dayStart, dayEnd } from "@/lib/date-utils";

// ─── Types ───────────────────────────────────────────────────────────

export type PaymentMethodExpense = "EFECTIVO" | "QR" | "TRANSFERENCIA" | "TARJETA";
export type Fund = "EFECTIVO" | "MERCADOPAGO";

export interface Expense {
  id: string;
  date: string;
  amount: number;
  payment_method: string;
  fund: string;
  category: string | null;
  description: string | null;
  is_pass_through: boolean;
  created_at: string;
}

export interface OpeningBalance {
  id: string;
  date: string;
  fund: string;
  amount: number;
  notes: string | null;
}

export interface DayRow {
  date: string;
  bruto: number;
  comisiones: number;
  neto: number;
  cogs: number;
  gastos: number;
  ganancia: number;
}

export interface DayDetail {
  ticketCount: number;
  bruto: number;
  comisiones: number;
  cogs: number;
  expenses: Expense[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function computeFund(paymentMethod: string): Fund {
  return paymentMethod === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
}

// ─── Resultado ───────────────────────────────────────────────────────

export async function fetchResultadoRange(from: string, to: string): Promise<DayRow[]> {
  // 1. Fetch COMPLETED sales
  const { data: sales } = await supabase
    .from("pos_sales")
    .select("id, created_at")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(from))
    .lte("created_at", dayEnd(to));

  const saleIds = (sales ?? []).map((s) => s.id);

  // 2. Fetch payments with commission_amount
  let payments: { sale_id: string; amount: number; commission_amount: number }[] = [];
  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("pos_payments")
      .select("sale_id, amount, commission_amount")
      .in("sale_id", saleIds);
    payments = (data ?? []) as typeof payments;
  }

  // 3. Fetch sale items (owner=LOCAL) with product cost_price for COGS
  let items: { sale_id: string; qty: number; cost_price: number }[] = [];
  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("pos_sale_items")
      .select("sale_id, qty, owner, product_id, products(cost_price)")
      .in("sale_id", saleIds)
      .eq("owner", "LOCAL");
    items = (data ?? []).map((i: any) => ({
      sale_id: i.sale_id,
      qty: i.qty,
      cost_price: i.products?.cost_price ?? 0,
    }));
  }

  // 4. Fetch operating expenses
  const { data: expenses } = await supabase
    .from("expenses")
    .select("date, amount")
    .gte("date", from)
    .lte("date", to)
    .eq("is_pass_through", false);

  // Build sale -> date map
  const saleDateMap = new Map<string, string>();
  for (const s of sales ?? []) {
    saleDateMap.set(s.id, format(new Date(s.created_at), "yyyy-MM-dd"));
  }

  // Build day map
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
  const map = new Map<string, DayRow>();
  for (const d of days) {
    const key = format(d, "yyyy-MM-dd");
    map.set(key, { date: key, bruto: 0, comisiones: 0, neto: 0, cogs: 0, gastos: 0, ganancia: 0 });
  }

  // Aggregate payments
  for (const p of payments) {
    const key = saleDateMap.get(p.sale_id);
    const row = key ? map.get(key) : undefined;
    if (row) {
      row.bruto += p.amount;
      row.comisiones += p.commission_amount ?? 0;
    }
  }

  // Aggregate COGS
  for (const i of items) {
    const key = saleDateMap.get(i.sale_id);
    const row = key ? map.get(key) : undefined;
    if (row) {
      row.cogs += i.qty * i.cost_price;
    }
  }

  // Aggregate expenses
  for (const e of expenses ?? []) {
    const row = map.get(e.date);
    if (row) row.gastos += e.amount;
  }

  // Compute derived fields
  const result = Array.from(map.values());
  for (const r of result) {
    r.neto = r.bruto - r.comisiones;
    r.ganancia = r.neto - r.cogs - r.gastos;
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchDayDetail(dateStr: string): Promise<DayDetail> {
  const { data: sales } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(dateStr))
    .lte("created_at", dayEnd(dateStr));

  const saleIds = (sales ?? []).map((s) => s.id);

  let bruto = 0;
  let comisiones = 0;
  if (saleIds.length > 0) {
    const { data: payments } = await supabase
      .from("pos_payments")
      .select("amount, commission_amount")
      .in("sale_id", saleIds);
    for (const p of payments ?? []) {
      bruto += p.amount;
      comisiones += (p as any).commission_amount ?? 0;
    }
  }

  let cogs = 0;
  if (saleIds.length > 0) {
    const { data: items } = await supabase
      .from("pos_sale_items")
      .select("qty, products(cost_price)")
      .in("sale_id", saleIds)
      .eq("owner", "LOCAL");
    for (const i of items ?? []) {
      cogs += i.qty * ((i as any).products?.cost_price ?? 0);
    }
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("date", dateStr)
    .eq("is_pass_through", false)
    .order("created_at", { ascending: false });

  return {
    ticketCount: saleIds.length,
    bruto,
    comisiones,
    cogs,
    expenses: (expenses ?? []) as Expense[],
  };
}

// ─── Restaurante ─────────────────────────────────────────────────────

export interface RestauranteRawDay {
  date: string;
  totalVendido: number;
  tickets: number;
  unidades: number;
}

export async function fetchRestauranteRange(from: string, to: string): Promise<RestauranteRawDay[]> {
  const { data: sales, error: se } = await supabase
    .from("pos_sales")
    .select("id, subtotal_restaurant, created_at")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(from))
    .lte("created_at", dayEnd(to));
  if (se) throw se;

  const { data: items, error: ie } = await supabase
    .from("pos_sale_items")
    .select("sale_id, qty, pos_sales!inner(created_at, status)")
    .eq("owner", "RESTAURANTE")
    .gte("pos_sales.created_at", dayStart(from))
    .lte("pos_sales.created_at", dayEnd(to));
  if (ie) throw ie;

  const qtyBySale = new Map<string, number>();
  for (const it of items ?? []) {
    const sale = (it as any).pos_sales;
    if (sale?.status !== "COMPLETED") continue;
    qtyBySale.set(it.sale_id, (qtyBySale.get(it.sale_id) ?? 0) + it.qty);
  }

  const map = new Map<string, RestauranteRawDay>();
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
  for (const d of days) {
    const key = format(d, "yyyy-MM-dd");
    map.set(key, { date: key, totalVendido: 0, tickets: 0, unidades: 0 });
  }

  for (const s of sales ?? []) {
    const key = format(new Date(s.created_at), "yyyy-MM-dd");
    const row = map.get(key);
    if (!row) continue;
    row.totalVendido += s.subtotal_restaurant ?? 0;
    if ((s.subtotal_restaurant ?? 0) > 0) row.tickets += 1;
    row.unidades += qtyBySale.get(s.id) ?? 0;
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Gastos range ────────────────────────────────────────────────────

export async function fetchExpensesRange(from: string, to: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

// ─── CRUD ────────────────────────────────────────────────────────────

export async function createExpense(data: {
  date: string;
  amount: number;
  payment_method: string;
  category: string;
  description: string;
}) {
  const fund = computeFund(data.payment_method);
  const is_pass_through = data.category === "Rendición restaurante";

  const { error } = await supabase.from("expenses").insert({
    date: data.date,
    amount: data.amount,
    payment_method: data.payment_method,
    fund,
    category: data.category,
    description: data.description,
    is_pass_through,
  });

  if (error) throw error;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertOpeningBalance(
  date: string,
  fund: string,
  amount: number,
  notes: string
) {
  const { data: existing } = await supabase
    .from("cash_opening_balances")
    .select("id")
    .eq("date", date)
    .eq("fund", fund)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from("cash_opening_balances")
      .update({ amount, notes })
      .eq("id", existing[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("cash_opening_balances")
      .insert({ date, fund, amount, notes });
    if (error) throw error;
  }
}

export async function createFundMovement(data: {
  date: string;
  fund: string;
  amount: number;
  type: string;
  description: string;
}) {
  const { error } = await supabase.from("fund_movements").insert(data);
  if (error) throw error;
}

export async function deleteFundMovement(id: string) {
  const { error } = await supabase.from("fund_movements").delete().eq("id", id);
  if (error) throw error;
}
