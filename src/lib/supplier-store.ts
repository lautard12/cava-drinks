import { supabase } from "@/integrations/supabase/client";

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  lead_time_days: number | null;
  created_at: string;
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function createSupplier(
  name: string,
  phone = "",
  leadTimeDays?: number | null,
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name, phone, lead_time_days: leadTimeDays ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Supplier;
}

export async function updateSupplier(
  id: string,
  updates: Partial<Omit<Supplier, "id" | "created_at">>,
) {
  const { error } = await supabase
    .from("suppliers")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSupplier(id: string) {
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export interface ProductPurchaseHistoryRow {
  purchase_date: string;
  supplier_name: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}

// Historial de compras de un producto (todos los proveedores, ordenado desc).
export async function fetchProductPurchaseHistory(
  productId: string,
  limit = 20,
): Promise<ProductPurchaseHistoryRow[]> {
  const { data, error } = await supabase
    .from("stock_purchase_items")
    .select("qty, unit_cost, line_total, stock_purchases!inner(purchase_date, supplier_name_snapshot)")
    .eq("product_id", productId)
    .order("stock_purchases(purchase_date)", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as {
      qty: number;
      unit_cost: number;
      line_total: number;
      stock_purchases: { purchase_date: string; supplier_name_snapshot: string };
    };
    return {
      purchase_date: row.stock_purchases.purchase_date,
      supplier_name: row.stock_purchases.supplier_name_snapshot,
      qty: row.qty,
      unit_cost: row.unit_cost,
      line_total: row.line_total,
    };
  });
}
