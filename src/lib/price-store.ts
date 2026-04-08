import { supabase } from "@/integrations/supabase/client";

const CHANNELS = ["RESTAURANTE", "DELIVERY"] as const;

export type Channel = (typeof CHANNELS)[number];

export interface SurchargeTier {
  id: string;
  name: string;
  slug: string;
  percentage: number;
  sort_order: number;
}

// Legacy compat interface — now derived from surcharge_tiers
export interface PriceSettings {
  debit_pct: number;
  credit_1_pct: number;
  credit_3_pct: number;
}

export interface ProductPrice {
  id: string;
  product_id: string;
  channel: string;
  term: string;
  price: number;
}

// ─── Surcharge Tiers ──────────────────────────────────────

export async function fetchSurchargeTiers(): Promise<SurchargeTier[]> {
  const { data, error } = await supabase
    .from("surcharge_tiers")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as SurchargeTier[];
}

export async function addSurchargeTier(name: string, slug: string, percentage: number): Promise<SurchargeTier> {
  // Get max sort_order
  const { data: existing } = await supabase
    .from("surcharge_tiers")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("surcharge_tiers")
    .insert({ name, slug, percentage, sort_order: nextOrder })
    .select()
    .single();
  if (error) throw error;
  return data as SurchargeTier;
}

export async function updateSurchargeTier(id: string, name: string, percentage: number) {
  const { error } = await supabase
    .from("surcharge_tiers")
    .update({ name, percentage })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSurchargeTier(id: string) {
  // Get slug before deleting
  const { data: tier } = await supabase
    .from("surcharge_tiers")
    .select("slug")
    .eq("id", id)
    .single();

  if (tier) {
    // Remove associated product prices
    await supabase
      .from("product_prices")
      .delete()
      .eq("term", tier.slug);
  }

  const { error } = await supabase
    .from("surcharge_tiers")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─── Legacy compat: fetchPriceSettings from surcharge_tiers ───

export async function fetchPriceSettings(): Promise<PriceSettings> {
  const tiers = await fetchSurchargeTiers();
  const findPct = (slug: string) => tiers.find(t => t.slug === slug)?.percentage ?? 0;
  return {
    debit_pct: findPct("DEBITO"),
    credit_1_pct: findPct("CREDITO_1"),
    credit_3_pct: findPct("CREDITO_3"),
  };
}

// ─── Product Prices ───────────────────────────────────────

export async function fetchProductPrices(productId: string): Promise<ProductPrice[]> {
  const { data, error } = await supabase
    .from("product_prices")
    .select("*")
    .eq("product_id", productId);
  if (error) throw error;
  return (data ?? []) as ProductPrice[];
}

export async function ensureProductPrices(productId: string): Promise<ProductPrice[]> {
  const tiers = await fetchSurchargeTiers();
  const existing = await fetchProductPrices(productId);
  const allTerms = ["BASE", ...tiers.map(t => t.slug)];
  const missing: { product_id: string; channel: string; term: string; price: number }[] = [];

  for (const channel of CHANNELS) {
    for (const term of allTerms) {
      if (!existing.find((p) => p.channel === channel && p.term === term)) {
        missing.push({ product_id: productId, channel, term, price: 0 });
      }
    }
  }

  if (missing.length > 0) {
    const { error } = await supabase.from("product_prices").insert(missing);
    if (error) throw error;
    return fetchProductPrices(productId);
  }

  return existing;
}

export async function saveProductPrices(
  productId: string,
  baseRestaurante: number,
  baseDelivery: number,
  tiers: SurchargeTier[]
) {
  const rows: { channel: string; term: string; price: number }[] = [];

  for (const ch of CHANNELS) {
    const base = ch === "RESTAURANTE" ? baseRestaurante : baseDelivery;
    rows.push({ channel: ch, term: "BASE", price: base });
    for (const tier of tiers) {
      rows.push({
        channel: ch,
        term: tier.slug,
        price: Math.round(base * (1 + tier.percentage / 100)),
      });
    }
  }

  for (const row of rows) {
    const { error } = await supabase
      .from("product_prices")
      .update({ price: row.price })
      .eq("product_id", productId)
      .eq("channel", row.channel)
      .eq("term", row.term);
    if (error) throw error;
  }
}

export async function recalculateAllPrices() {
  const tiers = await fetchSurchargeTiers();

  const { data: basePrices, error } = await supabase
    .from("product_prices")
    .select("product_id, channel, price")
    .eq("term", "BASE");
  if (error) throw error;

  for (const bp of basePrices ?? []) {
    for (const tier of tiers) {
      const derived = Math.round(bp.price * (1 + tier.percentage / 100));
      await supabase
        .from("product_prices")
        .update({ price: derived })
        .eq("product_id", bp.product_id)
        .eq("channel", bp.channel)
        .eq("term", tier.slug);
    }
  }
}

// Ensure all products have price rows for a newly added tier
export async function ensureAllProductsHaveTier(slug: string) {
  const { data: products } = await supabase
    .from("products")
    .select("id");

  if (!products || products.length === 0) return;

  for (const p of products) {
    for (const ch of CHANNELS) {
      const { data: existing } = await supabase
        .from("product_prices")
        .select("id")
        .eq("product_id", p.id)
        .eq("channel", ch)
        .eq("term", slug)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase
          .from("product_prices")
          .insert({ product_id: p.id, channel: ch, term: slug, price: 0 });
      }
    }
  }
}

export async function fetchPriceCompleteness(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("product_prices")
    .select("product_id, price");
  if (error) throw error;

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.price > 0) {
      map[row.product_id] = (map[row.product_id] ?? 0) + 1;
    }
  }
  return map;
}
