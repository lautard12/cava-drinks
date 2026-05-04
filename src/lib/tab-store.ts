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
  if (!cashierId) {
    throw new Error("No hay cajero autenticado. Iniciá sesión antes de abrir una cuenta.");
  }

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
      cashier_id: cashierId,
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
  if (!cashierId) {
    throw new Error("No hay cajero autenticado. Iniciá sesión antes de cerrar la cuenta.");
  }

  const items = await fetchTabItems(saleId);
  if (items.length === 0) throw new Error("La cuenta no tiene ítems");

  const { data: sale, error: se } = await supabase
    .from("pos_sales")
    .select("total")
    .eq("id", saleId)
    .single();
  if (se) throw se;
  const total = sale.total;

  // Recolectar componentes de ofertas para los items OFFER que tenga la cuenta.
  const offerItems = items.filter((i) => i.item_type === "OFFER" && i.offer_id);
  const regularLocalItems = items.filter(
    (i) => i.owner === "LOCAL" && i.product_id && i.item_type !== "OFFER",
  );

  const stockRequired: Record<string, { qty: number; name: string }> = {};
  const offerLabelByPid: Record<string, string> = {};
  const offerComponentsByItem: Record<
    string,
    { product_id: string; name: string; qty: number; unit_cost: number; line_cost: number }[]
  > = {};

  if (offerItems.length > 0) {
    const offerIds = [...new Set(offerItems.map((i) => i.offer_id!))];

    // Verificar que las ofertas sigan activas.
    const { data: offers } = await supabase
      .from("offers")
      .select("id, name, is_active")
      .in("id", offerIds);
    for (const o of offers ?? []) {
      if (!o.is_active) {
        throw new Error(`La oferta "${o.name}" fue desactivada. No se puede cobrar.`);
      }
    }

    const { data: oiData } = await supabase.from("offer_items").select("*").in("offer_id", offerIds);
    const componentProductIds = (oiData ?? []).map((d: { product_id: string }) => d.product_id);
    const { data: oiProducts } = await supabase
      .from("products")
      .select("id, name, variant_label, cost_price, track_stock")
      .in("id", componentProductIds);

    const prodInfoMap: Record<
      string,
      { id: string; name: string; variant_label: string; cost_price: number; track_stock: boolean }
    > = {};
    for (const p of (oiProducts ?? []) as typeof oiProducts) {
      if (p) prodInfoMap[p.id] = p as typeof prodInfoMap[string];
    }

    // Agrupar componentes por offer_id.
    const componentsByOffer: Record<
      string,
      { product_id: string; qty: number; name: string; cost: number; track_stock: boolean }[]
    > = {};
    for (const oi of (oiData ?? []) as { offer_id: string; product_id: string; qty: number }[]) {
      if (!componentsByOffer[oi.offer_id]) componentsByOffer[oi.offer_id] = [];
      const prod = prodInfoMap[oi.product_id];
      componentsByOffer[oi.offer_id].push({
        product_id: oi.product_id,
        qty: oi.qty,
        name: prod ? prod.name + (prod.variant_label ? ` ${prod.variant_label}` : "") : "?",
        cost: prod?.cost_price ?? 0,
        track_stock: prod?.track_stock ?? false,
      });
    }

    for (const item of offerItems) {
      const components = componentsByOffer[item.offer_id!];
      if (!components) continue;

      offerComponentsByItem[item.id] = components.map((c) => ({
        product_id: c.product_id,
        name: c.name,
        qty: c.qty * item.qty,
        unit_cost: c.cost,
        line_cost: c.cost * c.qty * item.qty,
      }));

      for (const c of components) {
        offerLabelByPid[c.product_id] = item.offer_name_snapshot ?? "Oferta";
        if (c.track_stock) {
          if (!stockRequired[c.product_id]) {
            stockRequired[c.product_id] = { qty: 0, name: c.name };
          }
          stockRequired[c.product_id].qty += c.qty * item.qty;
        }
      }
    }
  }

  if (regularLocalItems.length > 0) {
    const pids = regularLocalItems.map((i) => i.product_id!);
    const { data: prods } = await supabase
      .from("products")
      .select("id, track_stock")
      .in("id", pids);
    const trackMap: Record<string, boolean> = {};
    for (const p of (prods ?? []) as { id: string; track_stock: boolean }[]) {
      trackMap[p.id] = p.track_stock;
    }

    for (const item of regularLocalItems) {
      if (trackMap[item.product_id!]) {
        if (!stockRequired[item.product_id!]) {
          stockRequired[item.product_id!] = { qty: 0, name: item.name_snapshot };
        }
        stockRequired[item.product_id!].qty += item.qty;
      }
    }
  }

  const stockRequiredArray = Object.entries(stockRequired).map(([product_id, v]) => ({
    product_id,
    qty: v.qty,
    name: v.name,
  }));

  const paymentsPayload = payments.map((p) => ({
    payment_method: p.payment_method,
    amount: p.amount,
    surcharge_pct: p.surcharge_pct ?? surchargePct,
    installments: p.installments ?? 1,
  }));

  const { error: rpcErr } = await supabase.rpc("close_tab_atomic", {
    p_sale_id: saleId,
    p_cashier_id: cashierId,
    p_payments: paymentsPayload,
    p_surcharge_pct: surchargePct,
    p_stock_required: stockRequiredArray,
    p_offer_label_by_pid: offerLabelByPid,
    p_offer_components_by_item: offerComponentsByItem,
  });

  if (rpcErr) throw new Error(rpcErr.message);

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
  priceTerms: { code: string; surcharge_pct: number }[]
) {
  // 1. Update price_term on the sale
  const { error: ue } = await supabase
    .from("pos_sales")
    .update({ price_term: newTerm, updated_at: new Date().toISOString() })
    .eq("id", saleId);
  if (ue) throw ue;

  // 2. Get current items
  const items = await fetchTabItems(saleId);

  // 3. Get surcharge multiplier for restaurant items (los del local salen de product_prices).
  const term = priceTerms.find((t) => t.code === newTerm);
  const multiplier = term ? 1 + term.surcharge_pct / 100 : 1;

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
