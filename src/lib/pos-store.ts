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
  // Si está presente, la comisión se calcula con este recargo (split payment real
  // con distintos términos por línea). Si no, se usa saleData.surcharge_pct global.
  surcharge_pct?: number;
  price_term?: string;
  installments?: number;
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
    cost_price: (p as { cost_price?: number }).cost_price ?? 0,
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

  return (data ?? []).map((d: {
    id: string;
    name: string;
    price: number;
    category_id: string | null;
    description: string | null;
    is_offer: boolean | null;
    restaurant_categories: { name: string } | null;
  }) => ({
    id: d.id,
    name: d.name,
    price: d.price,
    category_id: d.category_id,
    category_name: d.restaurant_categories?.name ?? "Sin categoría",
    is_offer: d.is_offer ?? false,
    description: d.description ?? null,
  }));
}

interface OfferComponentInput {
  product_id: string;
  qty: number; // qty por unidad de oferta
  product_name: string;
  variant_label?: string;
  cost_price?: number;
  track_stock?: boolean;
}

// Construye el payload de stock requerido (consolidado para productos + componentes de oferta)
// y el desglose de componentes por item de oferta.
function buildSalePayload(items: CartItem[], costMap?: Record<string, number>) {
  const stockRequired: Record<string, { qty: number; name: string }> = {};
  const offerLabelByPid: Record<string, string> = {};

  const itemPayload = items.map((item) => {
    const isOffer = item.item_type === "OFFER";
    const components = (item as { _offer_items?: OfferComponentInput[] })._offer_items;

    let costSnapshot = 0;
    let offerComponentsPayload: {
      product_id: string;
      name: string;
      qty: number;
      unit_cost: number;
      line_cost: number;
    }[] | undefined;

    if (isOffer && components) {
      // costo unitario de la oferta = sumatoria de costo de componentes por unidad
      costSnapshot = components.reduce(
        (s, c) => s + (c.cost_price ?? costMap?.[c.product_id] ?? 0) * c.qty,
        0,
      );
      offerComponentsPayload = components.map((c) => {
        const unitCost = c.cost_price ?? costMap?.[c.product_id] ?? 0;
        return {
          product_id: c.product_id,
          name: c.product_name + (c.variant_label ? ` ${c.variant_label}` : ""),
          qty: c.qty * item.qty, // total qty del componente en toda la línea
          unit_cost: unitCost,
          line_cost: unitCost * c.qty * item.qty,
        };
      });

      // stock requirements + label de oferta
      for (const c of components) {
        if (c.track_stock) {
          const fullName = c.product_name + (c.variant_label ? ` ${c.variant_label}` : "");
          if (!stockRequired[c.product_id]) {
            stockRequired[c.product_id] = { qty: 0, name: fullName };
          }
          stockRequired[c.product_id].qty += c.qty * item.qty;
        }
        offerLabelByPid[c.product_id] = item.name;
      }
    } else if (item.item_type === "PRODUCT" && item.product_id) {
      costSnapshot = costMap?.[item.product_id] ?? 0;
      if (item.track_stock) {
        if (!stockRequired[item.product_id]) {
          stockRequired[item.product_id] = { qty: 0, name: item.name };
        }
        stockRequired[item.product_id].qty += item.qty;
      }
    }

    return {
      owner: item.owner,
      item_type: item.item_type,
      product_id: item.product_id ?? "",
      restaurant_item_id: item.restaurant_item_id ?? "",
      name: item.name,
      variant: item.variant,
      qty: item.qty,
      unit_price: item.unit_price,
      unit_price_base: item.unit_price_base ?? item.unit_price,
      notes: item.notes,
      cost_snapshot: costSnapshot,
      offer_id: item.offer_id ?? "",
      offer_name_snapshot: item.offer_name_snapshot ?? "",
      offer_price_snapshot: item.offer_price_snapshot ?? "",
      offer_components: offerComponentsPayload,
    };
  });

  const stockRequiredArray = Object.entries(stockRequired).map(([product_id, v]) => ({
    product_id,
    qty: v.qty,
    name: v.name,
  }));

  return { itemPayload, stockRequired: stockRequiredArray, offerLabelByPid };
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
  costMap?: Record<string, number>,
) {
  if (!saleData.cashier_id) {
    throw new Error("No hay cajero autenticado. Iniciá sesión antes de cobrar.");
  }

  const { itemPayload, stockRequired, offerLabelByPid } = buildSalePayload(items, costMap);

  const paymentsPayload = payments.map((p) => ({
    payment_method: p.payment_method,
    amount: p.amount,
    surcharge_pct: p.surcharge_pct ?? saleData.surcharge_pct ?? 0,
    installments: p.installments ?? 1,
  }));

  // RPC atómico: crea venta + items + componentes + pagos + stock_movements
  // y deduce stock_balances en una sola transacción con FOR UPDATE.
  const { data, error } = await supabase.rpc("create_sale_atomic", {
    p_channel: saleData.channel,
    p_price_term: saleData.price_term,
    p_delivery_fee: saleData.delivery_fee,
    p_cashier_id: saleData.cashier_id,
    p_cashier_name: saleData.cashier_name_snapshot ?? "",
    p_surcharge_pct: saleData.surcharge_pct ?? 0,
    p_items: itemPayload,
    p_payments: paymentsPayload,
    p_stock_required: stockRequired,
    p_offer_label_by_pid: offerLabelByPid,
  });

  if (error) throw new Error(error.message);

  return { saleId: data as string };
}

// Helper exportado para que tab-store pueda construir su propio payload.
export const _buildSalePayload = buildSalePayload;
