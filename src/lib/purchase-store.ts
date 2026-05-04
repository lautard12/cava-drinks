import { supabase } from "@/integrations/supabase/client";

export interface StockPurchase {
  id: string;
  purchase_date: string;
  supplier_id: string | null;
  supplier_name_snapshot: string;
  payment_fund: string;
  payment_method: string;
  total_amount: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  items?: StockPurchaseItem[];
}

export interface StockPurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  qty: number;
  unit_cost: number;
  line_total: number;
  product_name?: string;
  variant_label?: string;
}

export interface PurchaseItemInput {
  product_id: string;
  qty: number;
  unit_cost: number;
}

export interface LastPurchaseInfo {
  purchase_date: string;
  qty: number;
  unit_cost: number;
}

// ─── Listar compras ──────────────────────────────────────────────────

export async function fetchPurchases(from?: string, to?: string): Promise<StockPurchase[]> {
  let query = supabase
    .from("stock_purchases")
    .select("*")
    .order("purchase_date", { ascending: false });
  if (from) query = query.gte("purchase_date", from);
  if (to) query = query.lte("purchase_date", to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StockPurchase[];
}

// ─── Detalle con ítems ───────────────────────────────────────────────

export async function fetchPurchaseWithItems(purchaseId: string): Promise<StockPurchase | null> {
  const { data: purchase, error: pe } = await supabase
    .from("stock_purchases")
    .select("*")
    .eq("id", purchaseId)
    .single();
  if (pe) throw pe;
  if (!purchase) return null;

  const { data: items, error: ie } = await supabase
    .from("stock_purchase_items")
    .select("*, products(name, variant_label)")
    .eq("purchase_id", purchaseId);
  if (ie) throw ie;

  return {
    ...purchase,
    items: (items ?? []).map((i: { products?: { name?: string; variant_label?: string } | null } & Record<string, unknown>) => ({
      ...i,
      product_name: i.products?.name ?? "",
      variant_label: i.products?.variant_label ?? "",
      products: undefined,
    })),
  } as StockPurchase;
}

// ─── Crear compra (atómica vía RPC) ──────────────────────────────────

export async function createPurchase(params: {
  purchase_date: string;
  supplier_id?: string | null;
  supplier_name_snapshot: string;
  payment_fund: string;
  payment_method: string;
  notes?: string;
  items: PurchaseItemInput[];
  updateCostPrices?: boolean;
}): Promise<{ purchaseId: string }> {
  const { data, error } = await supabase.rpc("create_purchase", {
    p_purchase_date: params.purchase_date,
    p_supplier_id: params.supplier_id ?? null,
    p_supplier_name_snapshot: params.supplier_name_snapshot,
    p_payment_fund: params.payment_fund,
    p_payment_method: params.payment_method,
    p_notes: params.notes ?? null,
    p_items: params.items as unknown as never,
    p_update_cost_prices: params.updateCostPrices ?? false,
  });
  if (error) throw new Error(error.message);
  return { purchaseId: data as string };
}

// ─── Borrar compra (atómica vía RPC, revierte stock) ─────────────────

export async function deletePurchase(purchaseId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_purchase", { p_purchase_id: purchaseId });
  if (error) throw new Error(error.message);
}

// ─── Última compra de un producto (hint en UI) ───────────────────────

export async function fetchLastPurchaseForProduct(productId: string): Promise<LastPurchaseInfo | null> {
  const { data, error } = await supabase
    .from("stock_purchase_items")
    .select("qty, unit_cost, stock_purchases!inner(purchase_date)")
    .eq("product_id", productId)
    .order("stock_purchases(purchase_date)", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as {
    qty: number;
    unit_cost: number;
    stock_purchases: { purchase_date: string };
  };
  return {
    purchase_date: row.stock_purchases.purchase_date,
    qty: row.qty,
    unit_cost: row.unit_cost,
  };
}

// ─── Total por fondo (Finanzas → Capital) ────────────────────────────

export async function fetchPurchasesTotalByFund(from?: string, to?: string) {
  let query = supabase
    .from("stock_purchases")
    .select("payment_fund, total_amount");
  if (from) query = query.gte("purchase_date", from);
  if (to) query = query.lte("purchase_date", to);
  const { data, error } = await query;
  if (error) throw error;

  let efectivo = 0;
  let mercadopago = 0;
  for (const p of data ?? []) {
    if (p.payment_fund === "EFECTIVO") efectivo += p.total_amount;
    else mercadopago += p.total_amount;
  }
  return { efectivo, mercadopago };
}
