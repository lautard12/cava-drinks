import { supabase } from "@/integrations/supabase/client";
import type { CartItem, PaymentLine, PaymentMethod, Fund, Channel, PriceTerm } from "./pos-store";

export interface OpenTab {
  id: string;
  tab_name: string | null;
  channel: string;
  price_term: string;
  total: number;
  subtotal_local: number;
  subtotal_restaurant: number;
  opened_at: string;
  updated_at: string;
  item_count: number;
}

export interface TabSaleItem {
  id: string;
  sale_id: string;
  owner: string;
  item_type: string;
  product_id: string | null;
  restaurant_item_id: string | null;
  name_snapshot: string;
  variant_snapshot: string;
  qty: number;
  unit_price: number;
  line_total: number;
  notes: string;
  cost_snapshot: number;
  sent_to_kitchen: boolean;
  sent_at: string | null;
  offer_id: string | null;
  offer_name_snapshot: string | null;
  offer_price_snapshot: number | null;
}

function getFund(method: PaymentMethod): Fund {
  return method === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
}

export async function fetchOpenTabs(): Promise<OpenTab[]> {
  const { data: sales, error } = await supabase
    .from("pos_sales")
    .select("id, tab_name, channel, price_term, total, subtotal_local, subtotal_restaurant, opened_at, updated_at")
    .eq("status", "OPEN")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  // Get item counts
  const saleIds = (sales ?? []).map((s) => s.id);
  if (saleIds.length === 0) return [];

  const { data: items, error: ie } = await supabase
    .from("pos_sale_items")
    .select("sale_id")
    .in("sale_id", saleIds);
  if (ie) throw ie;

  const countMap: Record<string, number> = {};
  for (const it of items ?? []) {
    countMap[it.sale_id] = (countMap[it.sale_id] ?? 0) + 1;
  }

  return (sales ?? []).map((s) => ({
    id: s.id,
    tab_name: s.tab_name,
    channel: s.channel,
    price_term: s.price_term,
    total: s.total,
    subtotal_local: s.subtotal_local,
    subtotal_restaurant: s.subtotal_restaurant,
    opened_at: s.opened_at ?? "",
    updated_at: s.updated_at ?? "",
    item_count: countMap[s.id] ?? 0,
  }));
}

export async function createOpenTab(
  tabName: string,
  channel: Channel,
  priceTerm: PriceTerm,
  cashierId?: string,
  cashierName?: string
): Promise<{ id: string; tab_name: string | null }> {
  const { data, error } = await supabase
    .from("pos_sales")
    .insert({
      channel,
      price_term: priceTerm,
      status: "OPEN",
      tab_name: tabName || null,
      delivery_fee: 0,
      subtotal_local: 0,
      subtotal_restaurant: 0,
      total: 0,
      ...(cashierId ? { cashier_id: cashierId } : {}),
      cashier_name_snapshot: cashierName ?? "",
    })
    .select("id, tab_name")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchTabItems(saleId: string): Promise<TabSaleItem[]> {
  const { data, error } = await supabase
    .from("pos_sale_items")
    .select("*")
    .eq("sale_id", saleId)
    .order("id");
  if (error) throw error;
  return (data ?? []).map((d: any) => ({
    id: d.id,
    sale_id: d.sale_id,
    owner: d.owner,
    item_type: d.item_type,
    product_id: d.product_id,
    restaurant_item_id: d.restaurant_item_id,
    name_snapshot: d.name_snapshot,
    variant_snapshot: d.variant_snapshot,
    qty: d.qty,
    unit_price: d.unit_price,
    line_total: d.line_total,
    notes: d.notes,
    cost_snapshot: d.cost_snapshot,
    sent_to_kitchen: d.sent_to_kitchen ?? false,
    sent_at: d.sent_at,
    offer_id: d.offer_id ?? null,
    offer_name_snapshot: d.offer_name_snapshot ?? null,
    offer_price_snapshot: d.offer_price_snapshot ?? null,
  }));
}

async function recalcTotals(saleId: string) {
  const items = await fetchTabItems(saleId);
  const subtotalLocal = items
    .filter((i) => i.owner === "LOCAL")
    .reduce((s, i) => s + i.unit_price * i.qty, 0);
  const subtotalRestaurant = items
    .filter((i) => i.owner === "RESTAURANTE")
    .reduce((s, i) => s + i.unit_price * i.qty, 0);
  const total = subtotalLocal + subtotalRestaurant;

  const { error } = await supabase
    .from("pos_sales")
    .update({
      subtotal_local: subtotalLocal,
      subtotal_restaurant: subtotalRestaurant,
      total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId);
  if (error) throw error;
  return { subtotalLocal, subtotalRestaurant, total };
}

export async function addItemToTab(
  saleId: string,
  item: CartItem,
  costMap?: Record<string, number>
) {
  const itemAny = item as any;
  const isOffer = item.item_type === "OFFER";
  const { error } = await supabase.from("pos_sale_items").insert({
    sale_id: saleId,
    owner: item.owner,
    item_type: item.item_type,
    product_id: isOffer ? null : (item.product_id || null),
    restaurant_item_id: isOffer ? null : (item.restaurant_item_id || null),
    name_snapshot: item.name,
    variant_snapshot: item.variant,
    qty: item.qty,
    unit_price: item.unit_price,
    unit_price_base_snapshot: item.unit_price_base ?? item.unit_price,
    line_total: item.unit_price * item.qty,
    notes: item.notes,
    cost_snapshot: isOffer
      ? (itemAny._cost_snapshot ?? 0)
      : (item.product_id && costMap ? (costMap[item.product_id] ?? 0) : 0),
    sent_to_kitchen: isOffer ? false : undefined,
    offer_id: itemAny.offer_id ?? null,
    offer_name_snapshot: itemAny.offer_name_snapshot ?? null,
    offer_price_snapshot: itemAny.offer_price_snapshot ?? null,
  });
  if (error) throw error;
  await recalcTotals(saleId);
}

export async function removeItemFromTab(itemId: string, saleId: string) {
  const { error } = await supabase
    .from("pos_sale_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
  await recalcTotals(saleId);
}

export async function updateItemQtyInTab(itemId: string, saleId: string, newQty: number) {
  // Get current item to recalc line_total
  const { data: item, error: fe } = await supabase
    .from("pos_sale_items")
    .select("unit_price")
    .eq("id", itemId)
    .single();
  if (fe) throw fe;

  const { error } = await supabase
    .from("pos_sale_items")
    .update({ qty: newQty, line_total: item.unit_price * newQty })
    .eq("id", itemId);
  if (error) throw error;
  await recalcTotals(saleId);
}

export async function sendToKitchen(saleId: string): Promise<number> {
  const batchId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("pos_sale_items")
    .update({
      sent_to_kitchen: true,
      sent_at: new Date().toISOString(),
      kitchen_batch_id: batchId,
      kitchen_state: "PENDING",
    })
    .eq("sale_id", saleId)
    .eq("owner", "RESTAURANTE")
    .eq("sent_to_kitchen", false)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function closeTab(
  saleId: string,
  payments: PaymentLine[],
  surchargePct: number,
  cashierId?: string
) {
  const items = await fetchTabItems(saleId);
  if (items.length === 0) throw new Error("La cuenta no tiene ítems");

  const { data: sale, error: se } = await supabase
    .from("pos_sales")
    .select("total, subtotal_local, subtotal_restaurant")
    .eq("id", saleId)
    .single();
  if (se) throw se;
  const total = sale.total;

  // Build consolidated stock requirements (regular products + offer components)
  const stockRequired: Record<string, number> = {};
  const offerItems = items.filter((i) => i.item_type === "OFFER" && i.offer_id);
  const regularLocalItems = items.filter((i) => i.owner === "LOCAL" && i.product_id && i.item_type !== "OFFER");

  // Get all product IDs we need info for
  const allProductIds = new Set<string>();
  regularLocalItems.forEach((i) => allProductIds.add(i.product_id!));

  // For offers, fetch their components from the offers table
  const offerIds = [...new Set(offerItems.map((i) => i.offer_id!))];
  let offerComponentsMap: Record<string, { product_id: string; qty: number; name: string; cost: number }[]> = {};

  if (offerIds.length > 0) {
    // Verify offers are still active
    const { data: offers } = await supabase.from("offers").select("id, name, is_active").in("id", offerIds);
    for (const o of offers ?? []) {
      if (!o.is_active) {
        throw new Error(`La oferta "${o.name}" fue desactivada. No se puede cobrar.`);
      }
    }

    const { data: oiData } = await supabase.from("offer_items").select("*").in("offer_id", offerIds);
    const { data: oiProducts } = await supabase
      .from("products")
      .select("id, name, variant_label, cost_price, track_stock")
      .in("id", (oiData ?? []).map((d: any) => d.product_id));
    const prodInfoMap: Record<string, any> = {};
    for (const p of oiProducts ?? []) prodInfoMap[p.id] = p;

    for (const oi of oiData ?? []) {
      if (!offerComponentsMap[oi.offer_id]) offerComponentsMap[oi.offer_id] = [];
      const prod = prodInfoMap[oi.product_id];
      offerComponentsMap[oi.offer_id].push({
        product_id: oi.product_id,
        qty: oi.qty,
        name: prod ? prod.name + (prod.variant_label ? ` ${prod.variant_label}` : "") : "?",
        cost: prod?.cost_price ?? 0,
      });
      allProductIds.add(oi.product_id);
    }

    // Add offer component stock requirements
    for (const item of offerItems) {
      const components = offerComponentsMap[item.offer_id!];
      if (!components) continue;
      for (const c of components) {
        const prod = prodInfoMap[c.product_id];
        if (prod?.track_stock) {
          stockRequired[c.product_id] = (stockRequired[c.product_id] ?? 0) + c.qty * item.qty;
        }
      }
    }
  }

  // Add regular product stock requirements
  if (regularLocalItems.length > 0) {
    const pids = regularLocalItems.map((i) => i.product_id!);
    const { data: prods } = await supabase.from("products").select("id, track_stock").in("id", pids);
    const trackMap: Record<string, boolean> = {};
    for (const p of prods ?? []) trackMap[p.id] = p.track_stock;

    for (const item of regularLocalItems) {
      if (trackMap[item.product_id!]) {
        stockRequired[item.product_id!] = (stockRequired[item.product_id!] ?? 0) + item.qty;
      }
    }
  }

  // Validate all stock
  const allPids = Object.keys(stockRequired);
  if (allPids.length > 0) {
    const { data: balances } = await supabase
      .from("stock_balances")
      .select("product_id, qty_on_hand")
      .in("product_id", allPids);
    const balMap: Record<string, number> = {};
    for (const b of balances ?? []) balMap[b.product_id] = b.qty_on_hand;

    for (const [pid, needed] of Object.entries(stockRequired)) {
      const available = balMap[pid] ?? 0;
      if (needed > available) {
        const item = items.find((i) => i.product_id === pid);
        throw new Error(`Stock insuficiente para "${item?.name_snapshot ?? pid}". Disponible: ${available}, pedido: ${needed}`);
      }
    }
  }

  // Insert offer components into pos_sale_item_components
  for (const item of offerItems) {
    const components = offerComponentsMap[item.offer_id!];
    if (!components) continue;
    const rows = components.map((c) => ({
      sale_item_id: item.id,
      product_id: c.product_id,
      name_snapshot: c.name,
      qty: c.qty * item.qty,
      unit_cost_snapshot: c.cost,
      line_cost: c.cost * c.qty * item.qty,
    }));
    const { error: ce } = await supabase.from("pos_sale_item_components").insert(rows);
    if (ce) throw ce;

    // Update cost_snapshot on the offer sale item
    const totalCost = rows.reduce((s, r) => s + r.line_cost, 0);
    await supabase.from("pos_sale_items").update({ cost_snapshot: totalCost }).eq("id", item.id);
  }

  // Deduct stock
  for (const [pid, qty] of Object.entries(stockRequired)) {
    const offerItem = offerItems.find((i) => offerComponentsMap[i.offer_id!]?.some((c) => c.product_id === pid));
    const reason = offerItem ? `Venta POS — Oferta: ${offerItem.offer_name_snapshot}` : "Venta POS";

    const { error: me } = await supabase.from("stock_movements").insert({
      product_id: pid, type: "SALE", qty, reason,
      created_by: cashierId ?? "admin", sale_id: saleId,
    });
    if (me) throw me;

    const { data: bal } = await supabase.from("stock_balances").select("qty_on_hand").eq("product_id", pid).single();
    const newQty = (bal?.qty_on_hand ?? 0) - qty;
    const { error: ue } = await supabase.from("stock_balances").update({ qty_on_hand: newQty }).eq("product_id", pid);
    if (ue) throw ue;
  }

  // Insert payments
  const paymentRows = payments.map((p) => {
    const commissionAmount = surchargePct > 0
      ? Math.round(p.amount * surchargePct / (100 + surchargePct))
      : 0;
    return {
      sale_id: saleId,
      payment_method: p.payment_method,
      fund: getFund(p.payment_method),
      amount: p.amount,
      commission_amount: commissionAmount,
      commission_pct: surchargePct,
      installments: 1,
    };
  });
  const { error: ppe } = await supabase.from("pos_payments").insert(paymentRows);
  if (ppe) throw ppe;

  // Mark COMPLETED
  const { error: ue2 } = await supabase
    .from("pos_sales")
    .update({ status: "COMPLETED", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", saleId);
  if (ue2) throw ue2;

  return { saleId, total };
}

export async function cancelTab(saleId: string) {
  const { error } = await supabase
    .from("pos_sales")
    .update({
      status: "CANCELLED",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId);
  if (error) throw error;
}

export async function updateItemPriceInTab(itemId: string, saleId: string, newPrice: number) {
  const { error } = await supabase
    .from("pos_sale_items")
    .update({
      unit_price: newPrice,
      unit_price_base_snapshot: newPrice,
      line_total: newPrice, // will be recalculated with qty below
    })
    .eq("id", itemId);
  if (error) throw error;

  // Get qty to fix line_total
  const { data: item, error: fe } = await supabase
    .from("pos_sale_items")
    .select("qty")
    .eq("id", itemId)
    .single();
  if (fe) throw fe;

  await supabase
    .from("pos_sale_items")
    .update({ line_total: newPrice * item.qty })
    .eq("id", itemId);

  await recalcTotals(saleId);
}

export async function updateTabPriceTerm(
  saleId: string,
  newTerm: string,
  products: { id: string; prices: Record<string, number> }[],
  restaurantItems: { id: string; price: number }[],
  surchargeTiers: { slug: string; percentage: number }[]
) {
  // 1. Update price_term on the sale
  const { error: ue } = await supabase
    .from("pos_sales")
    .update({ price_term: newTerm, updated_at: new Date().toISOString() })
    .eq("id", saleId);
  if (ue) throw ue;

  // 2. Get current items
  const items = await fetchTabItems(saleId);

  // 3. Get surcharge multiplier for restaurant items
  const tier = surchargeTiers.find((t) => t.slug === newTerm);
  const multiplier = newTerm === "BASE" ? 1 : tier ? 1 + tier.percentage / 100 : 1;

  // 4. Update each item's price
  for (const item of items) {
    let newPrice = item.unit_price;

    if (item.owner === "LOCAL" && item.product_id) {
      const prod = products.find((p) => p.id === item.product_id);
      if (prod) {
        // Channel is always RESTAURANTE for tabs
        const key = `RESTAURANTE_${newTerm}`;
        newPrice = prod.prices[key] ?? item.unit_price;
      }
    } else if (item.owner === "RESTAURANTE" && item.restaurant_item_id) {
      const ri = restaurantItems.find((r) => r.id === item.restaurant_item_id);
      if (ri) {
        newPrice = Math.round(ri.price * multiplier);
      }
    }

    if (newPrice !== item.unit_price) {
      const { error } = await supabase
        .from("pos_sale_items")
        .update({ unit_price: newPrice, line_total: newPrice * item.qty })
        .eq("id", item.id);
      if (error) throw error;
    }
  }

  // 5. Recalc totals
  await recalcTotals(saleId);
}
