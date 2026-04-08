import { supabase } from "@/integrations/supabase/client";

// ─── Types ───

export interface Offer {
  id: string;
  name: string;
  type: "QUANTITY" | "COMBO";
  offer_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  created_by: string;
}

export interface OfferItem {
  id: string;
  offer_id: string;
  product_id: string;
  qty: number;
  sort_order: number;
}

export interface OfferWithItems extends Offer {
  items: (OfferItem & {
    product_name: string;
    variant_label: string;
    cost_price: number;
    track_stock: boolean;
    qty_on_hand: number;
  })[];
}

export interface OfferFormValues {
  name: string;
  type: "QUANTITY" | "COMBO";
  offer_price: number;
  is_active: boolean;
  items: { product_id: string; qty: number }[];
}

// ─── CRUD ───

export async function fetchOffers(): Promise<Offer[]> {
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Offer[];
}

export async function fetchOfferWithItems(offerId: string): Promise<OfferWithItems> {
  const { data: offer, error: oe } = await supabase
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .single();
  if (oe) throw oe;

  const { data: items, error: ie } = await supabase
    .from("offer_items")
    .select("*")
    .eq("offer_id", offerId)
    .order("sort_order");
  if (ie) throw ie;

  // Enrich with product info
  const productIds = (items ?? []).map((i: any) => i.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, variant_label, cost_price")
    .in("id", productIds);
  const { data: balances } = await supabase
    .from("stock_balances")
    .select("product_id, qty_on_hand")
    .in("product_id", productIds);

  const prodMap: Record<string, any> = {};
  for (const p of products ?? []) prodMap[p.id] = p;
  const balMap: Record<string, number> = {};
  for (const b of balances ?? []) balMap[b.product_id] = b.qty_on_hand;

  return {
    ...(offer as unknown as Offer),
    items: (items ?? []).map((i: any) => ({
      ...i,
      product_name: prodMap[i.product_id]?.name ?? "?",
      variant_label: prodMap[i.product_id]?.variant_label ?? "",
      cost_price: prodMap[i.product_id]?.cost_price ?? 0,
      track_stock: true,
      qty_on_hand: balMap[i.product_id] ?? 0,
    })),
  };
}

export async function fetchActiveOffersForPOS(): Promise<OfferWithItems[]> {
  const { data: offers, error } = await supabase
    .from("offers")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  if (!offers || offers.length === 0) return [];

  const offerIds = offers.map((o: any) => o.id);
  const { data: allItems, error: ie } = await supabase
    .from("offer_items")
    .select("*")
    .in("offer_id", offerIds)
    .order("sort_order");
  if (ie) throw ie;

  const productIds = [...new Set((allItems ?? []).map((i: any) => i.product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id, name, variant_label, cost_price, track_stock");
  const { data: balances } = await supabase
    .from("stock_balances")
    .select("product_id, qty_on_hand");

  const prodMap: Record<string, any> = {};
  for (const p of products ?? []) prodMap[p.id] = p;
  const balMap: Record<string, number> = {};
  for (const b of balances ?? []) balMap[b.product_id] = b.qty_on_hand;

  return offers.map((o: any): OfferWithItems => ({
    ...o,
    items: (allItems ?? [])
      .filter((i: any) => i.offer_id === o.id)
      .map((i: any) => ({
        ...i,
        product_name: prodMap[i.product_id]?.name ?? "?",
        variant_label: prodMap[i.product_id]?.variant_label ?? "",
        cost_price: prodMap[i.product_id]?.cost_price ?? 0,
        track_stock: prodMap[i.product_id]?.track_stock ?? true,
        qty_on_hand: balMap[i.product_id] ?? 0,
      })),
  }));
}

export async function createOffer(values: OfferFormValues): Promise<Offer> {
  const { data, error } = await supabase
    .from("offers")
    .insert({
      name: values.name,
      type: values.type,
      offer_price: values.offer_price,
      is_active: values.is_active,
    })
    .select()
    .single();
  if (error) throw error;
  const typed = data as unknown as Offer;

  const itemRows = values.items.map((item, idx) => ({
    offer_id: typed.id,
    product_id: item.product_id,
    qty: item.qty,
    sort_order: idx,
  }));
  const { error: ie } = await supabase.from("offer_items").insert(itemRows);
  if (ie) throw ie;

  return typed;
}

export async function updateOffer(id: string, values: OfferFormValues): Promise<void> {
  const { error } = await supabase
    .from("offers")
    .update({
      name: values.name,
      type: values.type,
      offer_price: values.offer_price,
      is_active: values.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  // Replace items
  const { error: de } = await supabase.from("offer_items").delete().eq("offer_id", id);
  if (de) throw de;

  const itemRows = values.items.map((item, idx) => ({
    offer_id: id,
    product_id: item.product_id,
    qty: item.qty,
    sort_order: idx,
  }));
  const { error: ie } = await supabase.from("offer_items").insert(itemRows);
  if (ie) throw ie;
}

export async function toggleOffer(id: string, currentActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("offers")
    .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOffer(id: string): Promise<void> {
  const { error } = await supabase.from("offers").delete().eq("id", id);
  if (error) throw error;
}

// ─── Stock validation helpers ───

/**
 * Calculate consolidated stock requirements for a list of offer components,
 * considering existing cart/tab items.
 */
export function consolidateStockRequirements(
  offerItems: { product_id: string; qty: number; track_stock: boolean }[],
  offerQty: number,
  existingCartItems: { product_id?: string; qty: number; item_type: string; offer_id?: string; }[],
  allOffers: OfferWithItems[]
): Record<string, number> {
  const required: Record<string, number> = {};

  // Add existing cart requirements
  for (const ci of existingCartItems) {
    if (ci.item_type === "PRODUCT" && ci.product_id) {
      required[ci.product_id] = (required[ci.product_id] ?? 0) + ci.qty;
    } else if (ci.item_type === "OFFER" && ci.offer_id) {
      const offer = allOffers.find((o) => o.id === ci.offer_id);
      if (offer) {
        for (const oi of offer.items) {
          if (oi.track_stock) {
            required[oi.product_id] = (required[oi.product_id] ?? 0) + oi.qty * ci.qty;
          }
        }
      }
    }
  }

  // Add new offer requirements
  for (const oi of offerItems) {
    if (oi.track_stock) {
      required[oi.product_id] = (required[oi.product_id] ?? 0) + oi.qty * offerQty;
    }
  }

  return required;
}

export function validateOfferStock(
  offerItems: { product_id: string; qty: number; track_stock: boolean; qty_on_hand: number; product_name: string }[],
  offerQty: number,
  stockMap: Record<string, number>,
  existingRequirements: Record<string, number>
): { valid: boolean; missing: { name: string; available: number; needed: number }[] } {
  const missing: { name: string; available: number; needed: number }[] = [];

  for (const oi of offerItems) {
    if (!oi.track_stock) continue;
    const totalNeeded = (existingRequirements[oi.product_id] ?? 0) + oi.qty * offerQty;
    const available = stockMap[oi.product_id] ?? oi.qty_on_hand;
    if (totalNeeded > available) {
      missing.push({ name: oi.product_name, available, needed: totalNeeded });
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Calculate cost_snapshot for an offer line based on component costs.
 */
export function calculateOfferCost(
  items: { qty: number; cost_price: number }[],
  offerQty: number
): number {
  return items.reduce((sum, i) => sum + i.cost_price * i.qty, 0) * offerQty;
}

/**
 * Insert pos_sale_item_components for an OFFER sale item.
 */
export async function insertSaleItemComponents(
  saleItemId: string,
  offerItems: { product_id: string; qty: number; product_name: string; variant_label: string; cost_price: number }[],
  offerQty: number
): Promise<void> {
  const rows = offerItems.map((oi) => ({
    sale_item_id: saleItemId,
    product_id: oi.product_id,
    name_snapshot: oi.product_name + (oi.variant_label ? ` ${oi.variant_label}` : ""),
    qty: oi.qty * offerQty,
    unit_cost_snapshot: oi.cost_price,
    line_cost: oi.cost_price * oi.qty * offerQty,
  }));
  const { error } = await supabase.from("pos_sale_item_components").insert(rows);
  if (error) throw error;
}
