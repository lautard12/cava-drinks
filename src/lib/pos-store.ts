import { supabase } from "@/integrations/supabase/client";

export type Channel = "RESTAURANTE" | "DELIVERY";
export type PriceTerm = string;
export type PaymentMethod = "EFECTIVO" | "QR" | "TRANSFERENCIA" | "TARJETA";
export type Fund = "EFECTIVO" | "MERCADOPAGO";
export type Owner = "LOCAL" | "RESTAURANTE";

export interface CartItem {
  id: string; // unique cart line id
  owner: Owner;
  item_type: "PRODUCT" | "RESTAURANT_ITEM" | "OFFER";
  product_id?: string;
  restaurant_item_id?: string;
  name: string;
  variant: string;
  qty: number;
  unit_price: number;
  unit_price_base?: number; // base price before surcharge
  notes: string;
  track_stock: boolean;
  // Offer-specific fields (only for item_type = 'OFFER')
  offer_id?: string;
  offer_name_snapshot?: string;
  offer_price_snapshot?: number;
}

export interface PaymentLine {
  payment_method: PaymentMethod;
  amount: number;
}

export interface ActiveProduct {
  id: string;
  name: string;
  type: string;
  category: string;
  variant_label: string;
  track_stock: boolean;
  qty_on_hand: number;
  cost_price: number;
  prices: Record<string, number>; // key = "RESTAURANTE_BASE" etc
}

export interface ActiveRestaurantItem {
  id: string;
  name: string;
  price: number;
  category_name: string;
  category_id: string | null;
  is_offer: boolean;
  description: string | null;
}

function getFund(method: PaymentMethod): Fund {
  return method === "EFECTIVO" ? "EFECTIVO" : "MERCADOPAGO";
}

export async function fetchActiveProductsWithPrices(): Promise<ActiveProduct[]> {
  const { data: products, error: pe } = await supabase
    .from("products")
    .select("id, name, type, category, variant_label, track_stock, cost_price")
    .eq("is_active", true);
  if (pe) throw pe;

  const { data: balances, error: be } = await supabase
    .from("stock_balances")
    .select("product_id, qty_on_hand");
  if (be) throw be;

  const { data: prices, error: pre } = await supabase
    .from("product_prices")
    .select("product_id, channel, term, price");
  if (pre) throw pre;

  const balMap: Record<string, number> = {};
  for (const b of balances ?? []) balMap[b.product_id] = b.qty_on_hand;

  const priceMap: Record<string, Record<string, number>> = {};
  for (const p of prices ?? []) {
    if (!priceMap[p.product_id]) priceMap[p.product_id] = {};
    priceMap[p.product_id][`${p.channel}_${p.term}`] = p.price;
  }

  return (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    category: p.category,
    variant_label: p.variant_label,
    track_stock: p.track_stock,
    cost_price: (p as any).cost_price ?? 0,
    qty_on_hand: balMap[p.id] ?? 0,
    prices: priceMap[p.id] ?? {},
  }));
}

export async function fetchActiveRestaurantItems(): Promise<ActiveRestaurantItem[]> {
  const { data, error } = await supabase
    .from("restaurant_items")
    .select("id, name, price, category_id, description, is_offer, restaurant_categories(name)")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    price: d.price,
    category_id: d.category_id,
    category_name: d.restaurant_categories?.name ?? "Sin categoría",
    is_offer: d.is_offer ?? false,
    description: d.description ?? null,
  }));
}

export async function createSale(
  saleData: {
    channel: Channel;
    price_term: PriceTerm;
    delivery_fee: number;
    cashier_id?: string;
    cashier_name_snapshot?: string;
    surcharge_pct?: number;
  },
  items: CartItem[],
  payments: PaymentLine[],
  costMap?: Record<string, number>
) {
  // 1. Build consolidated stock requirements (products + offer components)
  const stockRequired: Record<string, number> = {};
  const offerComponentsMap: Record<string, { product_id: string; qty: number; name: string; variant: string; cost: number }[]> = {};

  for (const item of items) {
    if (item.item_type === "PRODUCT" && item.track_stock && item.product_id) {
      stockRequired[item.product_id] = (stockRequired[item.product_id] ?? 0) + item.qty;
    } else if (item.item_type === "OFFER" && item.offer_id) {
      const offerItems = (item as any)._offer_items as any[] | undefined;
      if (offerItems) {
        offerComponentsMap[item.id] = offerItems.map((oi: any) => ({
          product_id: oi.product_id,
          qty: oi.qty,
          name: oi.product_name + (oi.variant_label ? ` ${oi.variant_label}` : ""),
          variant: oi.variant_label ?? "",
          cost: oi.cost_price ?? (costMap?.[oi.product_id] ?? 0),
        }));
        for (const oi of offerItems) {
          if (oi.track_stock) {
            stockRequired[oi.product_id] = (stockRequired[oi.product_id] ?? 0) + oi.qty * item.qty;
          }
        }
      }
    }
  }

  // Validate stock
  const productIds = Object.keys(stockRequired);
  if (productIds.length > 0) {
    const { data: balances, error: be } = await supabase
      .from("stock_balances")
      .select("product_id, qty_on_hand")
      .in("product_id", productIds);
    if (be) throw be;
    const balMap: Record<string, number> = {};
    for (const b of balances ?? []) balMap[b.product_id] = b.qty_on_hand;

    for (const [pid, needed] of Object.entries(stockRequired)) {
      const available = balMap[pid] ?? 0;
      if (needed > available) {
        const item = items.find((i) => i.product_id === pid);
        throw new Error(`Stock insuficiente para "${item?.name ?? pid}". Disponible: ${available}, pedido: ${needed}`);
      }
    }
  }

  // 2. Calculate totals
  const subtotalLocal = items
    .filter((i) => i.owner === "LOCAL")
    .reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  const subtotalRestaurant = items
    .filter((i) => i.owner === "RESTAURANTE")
    .reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  const total = subtotalLocal + saleData.delivery_fee + subtotalRestaurant;

  // 3. Insert sale
  const { data: sale, error: se } = await supabase
    .from("pos_sales")
    .insert({
      channel: saleData.channel,
      price_term: saleData.price_term,
      delivery_fee: saleData.delivery_fee,
      subtotal_local: subtotalLocal,
      subtotal_restaurant: subtotalRestaurant,
      total,
      ...(saleData.cashier_id ? { cashier_id: saleData.cashier_id } : {}),
      cashier_name_snapshot: saleData.cashier_name_snapshot ?? '',
    })
    .select("id")
    .single();
  if (se) throw se;
  const saleId = sale.id;

  // 4. Insert sale items
  const saleItems = items.map((i) => {
    const isOffer = i.item_type === "OFFER";
    const components = offerComponentsMap[i.id];
    const offerCost = isOffer && components
      ? components.reduce((s, c) => s + c.cost * c.qty, 0) * i.qty
      : 0;
    return {
      sale_id: saleId,
      owner: i.owner,
      item_type: i.item_type,
      product_id: isOffer ? null : (i.product_id || null),
      restaurant_item_id: isOffer ? null : (i.restaurant_item_id || null),
      name_snapshot: i.name,
      variant_snapshot: i.variant,
      qty: i.qty,
      unit_price: i.unit_price,
      unit_price_base_snapshot: i.unit_price_base ?? i.unit_price,
      line_total: i.unit_price * i.qty,
      notes: i.notes,
      cost_snapshot: isOffer ? offerCost : ((i.product_id && costMap) ? (costMap[i.product_id] ?? 0) : 0),
      sent_to_kitchen: isOffer ? false : undefined,
      offer_id: i.offer_id ?? null,
      offer_name_snapshot: i.offer_name_snapshot ?? null,
      offer_price_snapshot: i.offer_price_snapshot ?? null,
    };
  });

  const { data: insertedItems, error: ie } = await supabase
    .from("pos_sale_items")
    .insert(saleItems)
    .select("id, item_type, name_snapshot");
  if (ie) throw ie;

  // 5. Insert offer components
  for (const inserted of insertedItems ?? []) {
    if (inserted.item_type !== "OFFER") continue;
    // Find matching cart item by name
    const cartItem = items.find((i) => i.item_type === "OFFER" && i.name === inserted.name_snapshot);
    if (!cartItem) continue;
    const components = offerComponentsMap[cartItem.id];
    if (!components) continue;

    const componentRows = components.map((c) => ({
      sale_item_id: inserted.id,
      product_id: c.product_id,
      name_snapshot: c.name,
      qty: c.qty * cartItem.qty,
      unit_cost_snapshot: c.cost,
      line_cost: c.cost * c.qty * cartItem.qty,
    }));
    const { error: ce } = await supabase.from("pos_sale_item_components").insert(componentRows);
    if (ce) throw ce;
  }

  // 6. Insert payments
  const surchargePct = saleData.surcharge_pct ?? 0;

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

  // 7. Deduct stock for all tracked products (regular + offer components)
  for (const [pid, qty] of Object.entries(stockRequired)) {
    const offerName = items.find((i) => i.item_type === "OFFER" && offerComponentsMap[i.id]?.some((c) => c.product_id === pid))?.name;
    const reason = offerName ? `Venta POS — Oferta: ${offerName}` : "Venta POS";

    const { error: me } = await supabase.from("stock_movements").insert({
      product_id: pid,
      type: "SALE",
      qty,
      reason,
      created_by: saleData.cashier_id ?? "admin",
      sale_id: saleId,
    });
    if (me) throw me;

    const { data: bal } = await supabase
      .from("stock_balances")
      .select("qty_on_hand")
      .eq("product_id", pid)
      .single();
    const newQty = (bal?.qty_on_hand ?? 0) - qty;
    const { error: ue } = await supabase
      .from("stock_balances")
      .update({ qty_on_hand: newQty })
      .eq("product_id", pid);
    if (ue) throw ue;
  }

  return { saleId, total };
}
