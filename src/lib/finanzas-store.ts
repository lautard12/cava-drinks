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

export interface FundMovement {
  id: string;
  date: string;
  fund: string;
  amount: number;
  type: "INGRESO" | "RETIRO" | string;
  description: string | null;
  created_at: string;
}

export interface DayRow {
  date: string;
  bruto: number;            // ingreso del local (subtotal_local)
  comisionesCliente: number; // recargo MP/tarjeta cobrado al cliente — informativo, no afecta ganancia
  cogs: number;
  gastos: number;
  ganancia: number;
}

export interface DayDetail {
  ticketCount: number;
  bruto: number;             // ingreso del local
  comisionesCliente: number; // recargo cobrado al cliente — informativo
  cogs: number;
  devoluciones: number;
  expenses: Expense[];
}

export interface CapitalFundRow {
  fund: Fund;
  saldoInicial: number;
  entradas: number;     // ventas + ingresos manuales
  salidas: number;      // gastos operativos + retiros + rendiciones
  compras: number;      // compras a proveedores
  esperado: number;     // saldoInicial + entradas - salidas - compras
}

export interface CapitalSnapshot {
  funds: CapitalFundRow[];
  movements: FundMovement[];
  missingSaldoInicial: Fund[];
  pendienteRendirRestaurante: number; // vendido restaurante − ya rendido (acumulado histórico)
}

// Categoría reservada para identificar rendiciones al dueño del restaurante.
export const RENDICION_CATEGORY = "Rendición restaurante";

// ─── Ventas / Detalle de venta ───────────────────────────────────────

export interface SaleSummary {
  id: string;
  created_at: string;
  status: string;
  channel: string;
  price_term: string;
  total: number;             // total cobrado al cliente (local + restaurante + recargos)
  bruto: number;             // ingreso del local (subtotal_local)
  brutoRestaurante: number;  // a rendir al restaurante (subtotal_restaurant + delivery_fee)
  comisionesCliente: number; // recargo cobrado al cliente — informativo
  cogs: number;
  margen: number;            // bruto - cogs
  itemCount: number;
  hasRestaurantItems: boolean;
}

export interface SaleDetailItem {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  cost_snapshot: number;
  cost_total: number;
  line_margin: number;
  item_type: string;
  owner: string;
}

export interface SaleDetailPayment {
  id: string;
  payment_method: string;
  fund: string;
  amount: number;
  installments: number;
  commission_pct: number;
  commission_amount: number;
  net_amount: number;
}

export interface SaleDetail {
  id: string;
  created_at: string;
  status: string;
  channel: string;
  price_term: string;
  total: number;             // total cobrado al cliente (local + restaurante + recargos)
  cashier_name_snapshot: string;
  bruto: number;             // ingreso del local (subtotal_local)
  brutoRestaurante: number;  // a rendir al restaurante (subtotal_restaurant + delivery_fee)
  comisionesCliente: number; // recargo cobrado al cliente — informativo
  cogs: number;
  margen: number;            // bruto - cogs
  items: SaleDetailItem[];
  payments: SaleDetailPayment[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function computeFund(paymentMethod: string): Fund {
  return paymentMethod === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
}

const FUNDS: Fund[] = ["EFECTIVO", "MERCADOPAGO"];

// ─── Resultado ───────────────────────────────────────────────────────

export async function fetchResultadoRange(from: string, to: string): Promise<DayRow[]> {
  // 1. Ventas COMPLETED en el rango — bruto local = subtotal_local (no incluye restaurante ni recargos)
  const { data: sales } = await supabase
    .from("pos_sales")
    .select("id, created_at, subtotal_local")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(from))
    .lte("created_at", dayEnd(to));

  const saleIds = (sales ?? []).map((s) => s.id);

  // 2. Pagos — sólo para mostrar comisiones cobradas al cliente (informativo, no afecta ganancia)
  let payments: { sale_id: string; commission_amount: number }[] = [];
  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("pos_payments")
      .select("sale_id, commission_amount")
      .in("sale_id", saleIds);
    payments = (data ?? []) as typeof payments;
  }

  // 3. Items LOCAL — usamos cost_snapshot (costo unitario al momento de la venta)
  let items: { sale_id: string; qty: number; cost_snapshot: number }[] = [];
  if (saleIds.length > 0) {
    const { data } = await supabase
      .from("pos_sale_items")
      .select("sale_id, qty, cost_snapshot")
      .in("sale_id", saleIds)
      .eq("owner", "LOCAL");
    items = (data ?? []) as typeof items;
  }

  // 4. Gastos operativos del local (no pass-through, no soft-deleted) —
  //    las rendiciones al restaurante son pass-through y no afectan la ganancia.
  const { data: expenses } = await supabase
    .from("expenses")
    .select("date, amount")
    .gte("date", from)
    .lte("date", to)
    .eq("is_pass_through", false)
    .is("deleted_at", null);

  // sale -> date
  const saleDateMap = new Map<string, string>();
  for (const s of sales ?? []) {
    saleDateMap.set(s.id, format(new Date(s.created_at), "yyyy-MM-dd"));
  }

  // map de día → row
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
  const map = new Map<string, DayRow>();
  for (const d of days) {
    const key = format(d, "yyyy-MM-dd");
    map.set(key, { date: key, bruto: 0, comisionesCliente: 0, cogs: 0, gastos: 0, ganancia: 0 });
  }

  for (const s of sales ?? []) {
    const key = format(new Date(s.created_at), "yyyy-MM-dd");
    const row = map.get(key);
    if (row) row.bruto += s.subtotal_local ?? 0;
  }

  for (const p of payments) {
    const key = saleDateMap.get(p.sale_id);
    const row = key ? map.get(key) : undefined;
    if (row) row.comisionesCliente += p.commission_amount ?? 0;
  }

  for (const i of items) {
    const key = saleDateMap.get(i.sale_id);
    const row = key ? map.get(key) : undefined;
    if (row) row.cogs += i.qty * i.cost_snapshot;
  }

  for (const e of expenses ?? []) {
    const row = map.get(e.date);
    if (row) row.gastos += e.amount;
  }

  const result = Array.from(map.values());
  for (const r of result) {
    r.ganancia = r.bruto - r.cogs - r.gastos;
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchDayDetail(dateStr: string): Promise<DayDetail> {
  const { data: sales } = await supabase
    .from("pos_sales")
    .select("id, subtotal_local")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(dateStr))
    .lte("created_at", dayEnd(dateStr));

  const saleIds = (sales ?? []).map((s) => s.id);

  // Bruto del local = suma de subtotal_local (no incluye restaurante ni recargos al cliente).
  const bruto = (sales ?? []).reduce((sum, s) => sum + (s.subtotal_local ?? 0), 0);

  // Comisiones procesador — informativas, no afectan la ganancia del local.
  let comisionesCliente = 0;
  if (saleIds.length > 0) {
    const { data: payments } = await supabase
      .from("pos_payments")
      .select("commission_amount")
      .in("sale_id", saleIds);
    for (const p of payments ?? []) {
      comisionesCliente += p.commission_amount ?? 0;
    }
  }

  let cogs = 0;
  if (saleIds.length > 0) {
    const { data: items } = await supabase
      .from("pos_sale_items")
      .select("qty, cost_snapshot")
      .in("sale_id", saleIds)
      .eq("owner", "LOCAL");
    for (const i of items ?? []) {
      cogs += i.qty * (i.cost_snapshot ?? 0);
    }
  }

  // Sólo gastos operativos — las rendiciones al restaurante son pass-through.
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("date", dateStr)
    .eq("is_pass_through", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return {
    ticketCount: saleIds.length,
    bruto,
    comisionesCliente,
    cogs,
    devoluciones: 0,
    expenses: (expenses ?? []) as Expense[],
  };
}

// Listado de ventas del día (sólo las que tienen items LOCAL — el detalle restaurante
// se ve en la tab Restaurante).
export async function fetchSalesByDay(dateStr: string): Promise<SaleSummary[]> {
  const { data: sales } = await supabase
    .from("pos_sales")
    .select("id, created_at, status, channel, price_term, total, subtotal_local, subtotal_restaurant, delivery_fee")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(dateStr))
    .lte("created_at", dayEnd(dateStr))
    .order("created_at", { ascending: false });

  const saleIds = (sales ?? []).map((s) => s.id);
  if (saleIds.length === 0) return [];

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from("pos_sale_items")
      .select("sale_id, qty, line_total, cost_snapshot, owner, item_type")
      .in("sale_id", saleIds),
    supabase
      .from("pos_payments")
      .select("sale_id, commission_amount")
      .in("sale_id", saleIds),
  ]);

  const itemsBySale = new Map<string, { qty: number; line_total: number; cost_snapshot: number; owner: string; item_type: string }[]>();
  for (const i of itemsRes.data ?? []) {
    const arr = itemsBySale.get(i.sale_id) ?? [];
    arr.push(i);
    itemsBySale.set(i.sale_id, arr);
  }

  const paymentsBySale = new Map<string, { commission_amount: number }[]>();
  for (const p of paymentsRes.data ?? []) {
    const arr = paymentsBySale.get(p.sale_id) ?? [];
    arr.push(p);
    paymentsBySale.set(p.sale_id, arr);
  }

  const result: SaleSummary[] = [];
  for (const s of sales ?? []) {
    const items = itemsBySale.get(s.id) ?? [];
    const localItems = items.filter((i) => i.owner === "LOCAL");

    // Filtro: si la venta NO tiene items LOCAL, la salteamos (es 100% restaurante).
    if (localItems.length === 0) continue;

    const payments = paymentsBySale.get(s.id) ?? [];
    const bruto = s.subtotal_local ?? 0;
    const brutoRestaurante = (s.subtotal_restaurant ?? 0) + (s.delivery_fee ?? 0);
    const comisionesCliente = payments.reduce((sum, p) => sum + (p.commission_amount ?? 0), 0);
    const cogs = localItems.reduce((sum, i) => sum + i.qty * (i.cost_snapshot ?? 0), 0);

    result.push({
      id: s.id,
      created_at: s.created_at,
      status: s.status,
      channel: s.channel,
      price_term: s.price_term,
      total: s.total,
      bruto,
      brutoRestaurante,
      comisionesCliente,
      cogs,
      margen: bruto - cogs,
      itemCount: localItems.length,
      hasRestaurantItems: items.some((i) => i.owner === "RESTAURANTE"),
    });
  }
  return result;
}

export async function fetchSaleDetail(saleId: string): Promise<SaleDetail | null> {
  const { data: sale, error: se } = await supabase
    .from("pos_sales")
    .select("id, created_at, status, channel, price_term, total, subtotal_local, subtotal_restaurant, delivery_fee, cashier_name_snapshot")
    .eq("id", saleId)
    .maybeSingle();
  if (se) throw se;
  if (!sale) return null;

  const [itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from("pos_sale_items")
      .select("id, name_snapshot, variant_snapshot, qty, unit_price, line_total, cost_snapshot, item_type, owner")
      .eq("sale_id", saleId),
    supabase
      .from("pos_payments")
      .select("id, payment_method, fund, amount, installments, commission_pct, commission_amount")
      .eq("sale_id", saleId),
  ]);

  const items: SaleDetailItem[] = (itemsRes.data ?? []).map((i) => {
    const cost_total = i.qty * (i.cost_snapshot ?? 0);
    return {
      id: i.id,
      name: i.name_snapshot + (i.variant_snapshot ? ` ${i.variant_snapshot}` : ""),
      qty: i.qty,
      unit_price: i.unit_price,
      line_total: i.line_total,
      cost_snapshot: i.cost_snapshot ?? 0,
      cost_total,
      line_margin: i.line_total - cost_total,
      item_type: i.item_type,
      owner: i.owner,
    };
  });

  const payments: SaleDetailPayment[] = (paymentsRes.data ?? []).map((p) => ({
    id: p.id,
    payment_method: p.payment_method,
    fund: p.fund,
    amount: p.amount,
    installments: p.installments ?? 1,
    commission_pct: p.commission_pct ?? 0,
    commission_amount: p.commission_amount ?? 0,
    net_amount: p.amount - (p.commission_amount ?? 0),
  }));

  const bruto = sale.subtotal_local ?? 0;
  const brutoRestaurante = (sale.subtotal_restaurant ?? 0) + (sale.delivery_fee ?? 0);
  const comisionesCliente = payments.reduce((s, p) => s + p.commission_amount, 0);
  const cogs = items
    .filter((i) => i.owner === "LOCAL")
    .reduce((s, i) => s + i.cost_total, 0);

  return {
    id: sale.id,
    created_at: sale.created_at,
    status: sale.status,
    channel: sale.channel,
    price_term: sale.price_term,
    total: sale.total,
    cashier_name_snapshot: sale.cashier_name_snapshot ?? "",
    bruto,
    brutoRestaurante,
    comisionesCliente,
    cogs,
    margen: bruto - cogs,
    items,
    payments,
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
  // Lo que se le rinde al restaurante = subtotal_restaurant + delivery_fee
  // (el envío es pass-through al dueño del restaurante por decisión actual del negocio).
  const { data: sales, error: se } = await supabase
    .from("pos_sales")
    .select("id, subtotal_restaurant, delivery_fee, created_at")
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
    const sale = (it as { pos_sales?: { status?: string } }).pos_sales;
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
    const totalRestSale = (s.subtotal_restaurant ?? 0) + (s.delivery_fee ?? 0);
    row.totalVendido += totalRestSale;
    if (totalRestSale > 0) row.tickets += 1;
    row.unidades += qtyBySale.get(s.id) ?? 0;
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Gastos ──────────────────────────────────────────────────────────

export async function fetchExpensesRange(from: string, to: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function createExpense(data: {
  date: string;
  amount: number;
  payment_method: string;
  category: string;
  description: string;
  is_pass_through: boolean;
}) {
  const fund = computeFund(data.payment_method);

  const { error } = await supabase.from("expenses").insert({
    date: data.date,
    amount: data.amount,
    payment_method: data.payment_method,
    fund,
    category: data.category,
    description: data.description,
    is_pass_through: data.is_pass_through,
  });

  if (error) throw error;
}

// Soft delete: marca deleted_at = now().
export async function deleteExpense(id: string) {
  const { error } = await supabase
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ─── Capital ─────────────────────────────────────────────────────────

// Saldo inicial vigente para un fondo en una fecha (último <= refDate).
async function fetchOpeningBalanceForFund(refDate: string, fund: Fund): Promise<OpeningBalance | null> {
  const { data, error } = await supabase
    .from("cash_opening_balances")
    .select("*")
    .eq("fund", fund)
    .lte("date", refDate)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as OpeningBalance | null;
}

export async function fetchFundMovementsRange(from: string, to: string): Promise<FundMovement[]> {
  const { data, error } = await supabase
    .from("fund_movements")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FundMovement[];
}

export async function upsertOpeningBalance(
  date: string,
  fund: string,
  amount: number,
  notes: string,
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
  const { error } = await supabase
    .from("fund_movements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Snapshot de capital para un rango.
 *
 * - saldoInicial: último cash_opening_balances <= `from` por fondo.
 *   El saldo refleja el "punto de partida" del rango.
 * - entradas EFECTIVO    = sum(pos_payments.amount) WHERE fund='EFECTIVO'
 * - entradas MERCADOPAGO = sum(amount - commission_amount) — MP acredita NETO de comisión
 * - + ingresos manuales (fund_movements type='INGRESO')
 * - salidas              = expenses operativos (no pass-through) + retiros (RETIRO)
 * - compras              = stock_purchases.total_amount por payment_fund
 * - esperado             = saldoInicial + entradas - salidas - compras
 */
export async function fetchCapitalRange(from: string, to: string): Promise<CapitalSnapshot> {
  // Saldo inicial por fondo (último <= from)
  const openings = await Promise.all(FUNDS.map((f) => fetchOpeningBalanceForFund(from, f)));
  const saldoInicialMap: Record<Fund, number> = { EFECTIVO: 0, MERCADOPAGO: 0 };
  const missingSaldoInicial: Fund[] = [];
  FUNDS.forEach((f, idx) => {
    const op = openings[idx];
    if (!op) missingSaldoInicial.push(f);
    saldoInicialMap[f] = op?.amount ?? 0;
  });

  // Ventas COMPLETED en el rango → para entradas
  const { data: sales } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("status", "COMPLETED")
    .gte("created_at", dayStart(from))
    .lte("created_at", dayEnd(to));
  const saleIds = (sales ?? []).map((s) => s.id);

  const entradasMap: Record<Fund, number> = { EFECTIVO: 0, MERCADOPAGO: 0 };
  if (saleIds.length > 0) {
    const { data: payments } = await supabase
      .from("pos_payments")
      .select("fund, amount, commission_amount")
      .in("sale_id", saleIds);
    for (const p of payments ?? []) {
      const fund = (p.fund as Fund) === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
      if (fund === "EFECTIVO") {
        entradasMap.EFECTIVO += p.amount;
      } else {
        entradasMap.MERCADOPAGO += p.amount - (p.commission_amount ?? 0);
      }
    }
  }

  // Movimientos manuales en el rango (separamos INGRESO / RETIRO)
  const movements = await fetchFundMovementsRange(from, to);
  const salidasMap: Record<Fund, number> = { EFECTIVO: 0, MERCADOPAGO: 0 };
  for (const m of movements) {
    const fund = m.fund === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
    if (m.type === "INGRESO") entradasMap[fund] += m.amount;
    else if (m.type === "RETIRO") salidasMap[fund] += m.amount;
  }

  // Gastos — incluye operativos Y pass-through (rendiciones al restaurante).
  // La plata sale físicamente del fondo en ambos casos, así que afecta al saldo de caja.
  const { data: expenses } = await supabase
    .from("expenses")
    .select("fund, amount")
    .gte("date", from)
    .lte("date", to)
    .is("deleted_at", null);
  for (const e of expenses ?? []) {
    const fund = e.fund === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
    salidasMap[fund] += e.amount;
  }

  // Compras a proveedores
  const { data: purchases } = await supabase
    .from("stock_purchases")
    .select("payment_fund, total_amount")
    .gte("purchase_date", from)
    .lte("purchase_date", to);
  const comprasMap: Record<Fund, number> = { EFECTIVO: 0, MERCADOPAGO: 0 };
  for (const p of purchases ?? []) {
    const fund = p.payment_fund === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
    comprasMap[fund] += p.total_amount;
  }

  const funds: CapitalFundRow[] = FUNDS.map((f) => {
    const saldoInicial = saldoInicialMap[f];
    const entradas = entradasMap[f];
    const salidas = salidasMap[f];
    const compras = comprasMap[f];
    return {
      fund: f,
      saldoInicial,
      entradas,
      salidas,
      compras,
      esperado: saldoInicial + entradas - salidas - compras,
    };
  });

  // Pendiente de rendir al restaurante (acumulado histórico hasta `to`):
  //   Σ(subtotal_restaurant + delivery_fee de ventas COMPLETED) − Σ(rendiciones registradas).
  // Las rendiciones se identifican por la categoría reservada RENDICION_CATEGORY (pass-through).
  const { data: allRestSales } = await supabase
    .from("pos_sales")
    .select("subtotal_restaurant, delivery_fee")
    .eq("status", "COMPLETED")
    .lte("created_at", dayEnd(to));
  const totalAdeudado = (allRestSales ?? []).reduce(
    (sum, s) => sum + (s.subtotal_restaurant ?? 0) + (s.delivery_fee ?? 0),
    0,
  );

  const { data: rendiciones } = await supabase
    .from("expenses")
    .select("amount")
    .eq("category", RENDICION_CATEGORY)
    .eq("is_pass_through", true)
    .lte("date", to)
    .is("deleted_at", null);
  const totalRendido = (rendiciones ?? []).reduce((sum, r) => sum + r.amount, 0);

  const pendienteRendirRestaurante = totalAdeudado - totalRendido;

  return { funds, movements, missingSaldoInicial, pendienteRendirRestaurante };
}

// Snapshot de capital "actual" — desde un punto de partida (último opening balance) hasta hoy.
export async function fetchCapitalCurrent(): Promise<CapitalSnapshot> {
  const today = format(new Date(), "yyyy-MM-dd");
  return fetchCapitalRange(today, today);
}

// ─── Arqueo de caja (cash_counts) ─────────────────────────────────────

export interface CashCount {
  id: string;
  date: string;
  fund: Fund;
  expected_amount: number;
  counted_amount: number;
  difference: number;
  notes: string | null;
  counted_by_name: string;
  created_at: string;
  updated_at: string;
}

export async function fetchCashCountsForDate(date: string): Promise<CashCount[]> {
  const { data, error } = await supabase
    .from("cash_counts")
    .select("*")
    .eq("date", date);
  if (error) throw error;
  return (data ?? []) as CashCount[];
}

// Upsert: una fila por (date, fund). Si ya existe, se actualiza con el nuevo conteo.
// expected_amount se snapshotea al momento del arqueo: si después cambian las ventas
// del día, queda el valor original para auditar.
export async function upsertCashCount(input: {
  date: string;
  fund: Fund;
  expected_amount: number;
  counted_amount: number;
  notes?: string;
  counted_by?: string;
  counted_by_name?: string;
}) {
  const { error } = await supabase
    .from("cash_counts")
    .upsert(
      {
        date: input.date,
        fund: input.fund,
        expected_amount: input.expected_amount,
        counted_amount: input.counted_amount,
        notes: input.notes ?? null,
        counted_by: input.counted_by ?? null,
        counted_by_name: input.counted_by_name ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date,fund" },
    );
  if (error) throw error;
}
