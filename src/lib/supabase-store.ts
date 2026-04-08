import { supabase } from "@/integrations/supabase/client";
import { MovementType } from "./types";

// ─── Product Types ────────────────────────────────────────

export interface ProductTypeRecord {
  id: string;
  name: string;
  sku_prefix: string;
  units: string[];
}

export async function fetchProductTypes(): Promise<ProductTypeRecord[]> {
  const { data, error } = await supabase
    .from("product_types")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ProductTypeRecord[];
}

export async function addProductType(name: string, skuPrefix: string, units: string[]): Promise<ProductTypeRecord> {
  const { data, error } = await supabase
    .from("product_types")
    .insert({ name: name.toUpperCase(), sku_prefix: skuPrefix.toUpperCase(), units })
    .select()
    .single();
  if (error) throw error;
  return data as ProductTypeRecord;
}

// ─── Categories ───────────────────────────────────────────

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function addCategory(name: string) {
  const { data, error } = await supabase
    .from("categories")
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Queries ──────────────────────────────────────────────

export async function fetchProductsWithStock() {
  const { data, error } = await supabase
    .from("products")
    .select("*, stock_balances(qty_on_hand)")
    .eq("is_active", true);

  if (error) throw error;

  return (data ?? []).map((p: any) => {
    const qty = p.stock_balances?.qty_on_hand ?? 0;
    let status: "sin_stock" | "bajo" | "ok" = "ok";
    if (qty <= 0) status = "sin_stock";
    else if (qty <= p.min_stock) status = "bajo";
    return { ...p, qty_on_hand: qty, status, stock_balances: undefined };
  });
}

export async function fetchAllProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMovements() {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*, products(name, variant_label, type)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    ...m,
    product: m.products,
    products: undefined,
  }));
}

// ─── Mutations ────────────────────────────────────────────

export async function addMovement(
  productId: string,
  type: MovementType,
  qty: number,
  reason: string
) {
  const { data: bal } = await supabase
    .from("stock_balances")
    .select("qty_on_hand")
    .eq("product_id", productId)
    .single();

  const currentQty = bal?.qty_on_hand ?? 0;

  let delta = qty;
  if (type === "WASTE" || type === "SALE") delta = -Math.abs(qty);
  if (type === "PURCHASE") delta = Math.abs(qty);

  const newQty = currentQty + delta;
  if (newQty < 0) {
    return { error: `Stock insuficiente. Stock actual: ${currentQty}` };
  }

  const { error: movErr } = await supabase.from("stock_movements").insert({
    product_id: productId,
    type,
    qty: delta,
    reason: reason || type,
  });
  if (movErr) return { error: movErr.message };

  const { error: balErr } = await supabase.from("stock_balances").upsert(
    { product_id: productId, qty_on_hand: newQty },
    { onConflict: "product_id" }
  );
  if (balErr) return { error: balErr.message };

  return { success: true };
}

export async function addProduct(data: {
  name: string;
  type: string;
  category: string;
  variant_label: string;
  sku: string;
  min_stock: number;
  track_stock: boolean;
  is_active: boolean;
}) {
  const { data: product, error } = await supabase
    .from("products")
    .insert(data)
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from("stock_balances")
    .insert({ product_id: product.id, qty_on_hand: 0 });

  return product;
}

export async function updateProduct(
  id: string,
  data: Record<string, any>
) {
  const { error } = await supabase
    .from("products")
    .update(data)
    .eq("id", id);
  if (error) throw error;
}

export async function toggleProduct(id: string, currentActive: boolean) {
  const { error } = await supabase
    .from("products")
    .update({ is_active: !currentActive })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function duplicateProduct(id: string) {
  const { data: src, error: fetchErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !src) throw fetchErr;

  const { id: _id, created_at: _ca, ...rest } = src;
  const dup = {
    ...rest,
    variant_label: src.variant_label + " (copia)",
    sku: src.sku + "-DUP",
  };

  const { data: newProduct, error } = await supabase
    .from("products")
    .insert(dup)
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from("stock_balances")
    .insert({ product_id: newProduct.id, qty_on_hand: 0 });

  return newProduct;
}

export async function applyCount(counts: Record<string, number>) {
  const productIds = Object.keys(counts);
  const { data: balances } = await supabase
    .from("stock_balances")
    .select("*")
    .in("product_id", productIds);

  const balMap = new Map(
    (balances ?? []).map((b) => [b.product_id, b.qty_on_hand])
  );

  const movementsToInsert: any[] = [];
  const balanceUpserts: any[] = [];

  for (const [productId, realQty] of Object.entries(counts)) {
    const currentQty = balMap.get(productId) ?? 0;
    const diff = realQty - currentQty;
    if (diff !== 0) {
      movementsToInsert.push({
        product_id: productId,
        type: "ADJUST",
        qty: diff,
        reason: `Conteo físico: ${currentQty} → ${realQty}`,
      });
      balanceUpserts.push({
        product_id: productId,
        qty_on_hand: realQty,
      });
    }
  }

  if (movementsToInsert.length > 0) {
    const { error: movErr } = await supabase
      .from("stock_movements")
      .insert(movementsToInsert);
    if (movErr) throw movErr;

    const { error: balErr } = await supabase
      .from("stock_balances")
      .upsert(balanceUpserts, { onConflict: "product_id" });
    if (balErr) throw balErr;
  }

  return movementsToInsert.length;
}
