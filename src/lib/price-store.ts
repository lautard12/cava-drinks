import { supabase } from "@/integrations/supabase/client";
import { fetchPriceTerms, type PriceTerm } from "./config-store";

const CHANNELS = ["RESTAURANTE", "DELIVERY"] as const;

export type Channel = (typeof CHANNELS)[number];

// Re-export PriceTerm for callers that previously imported SurchargeTier from here.
export type { PriceTerm };

export interface ProductPrice {
  id: string;
  product_id: string;
  channel: string;
  term: string;
  price: number;
}

// ─── Anchor term helpers ──────────────────────────────────
// El ancla es el price_term con sort_order = 0 y surcharge_pct = 0.
// Es el precio "base" que el usuario carga manualmente; los demás se derivan.

export function findAnchor(terms: PriceTerm[]): PriceTerm | null {
  return terms.find((t) => t.sort_order === 0 && t.surcharge_pct === 0) ?? null;
}

export async function fetchAnchorTerm(): Promise<PriceTerm> {
  const terms = await fetchPriceTerms();
  const anchor = findAnchor(terms);
  if (!anchor) {
    throw new Error("No hay un término ancla configurado (sort_order=0, surcharge_pct=0).");
  }
  return anchor;
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

// Garantiza que el producto tenga un row en product_prices por cada (channel, term activo).
export async function ensureProductPrices(productId: string): Promise<ProductPrice[]> {
  const terms = await fetchPriceTerms();
  const existing = await fetchProductPrices(productId);
  const missing: { product_id: string; channel: string; term: string; price: number }[] = [];

  for (const channel of CHANNELS) {
    for (const term of terms) {
      if (!existing.find((p) => p.channel === channel && p.term === term.code)) {
        missing.push({ product_id: productId, channel, term: term.code, price: 0 });
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

// Guarda el precio ancla por canal y deriva el resto.
//   anchorRest / anchorDel = precio cargado por el usuario para el término ancla.
//   terms = todos los price_terms (incluyendo el ancla).
export async function saveProductPrices(
  productId: string,
  anchorRest: number,
  anchorDel: number,
  terms: PriceTerm[],
) {
  const anchor = findAnchor(terms);
  if (!anchor) {
    throw new Error("No hay un término ancla configurado.");
  }

  const rows: { channel: string; term: string; price: number }[] = [];

  for (const ch of CHANNELS) {
    const base = ch === "RESTAURANTE" ? anchorRest : anchorDel;
    for (const term of terms) {
      const price =
        term.code === anchor.code
          ? base
          : Math.round(base * (1 + term.surcharge_pct / 100));
      rows.push({ channel: ch, term: term.code, price });
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

// Recalcula todos los precios derivados a partir del precio del ancla.
export async function recalculateAllPrices() {
  const terms = await fetchPriceTerms();
  const anchor = findAnchor(terms);
  if (!anchor) {
    throw new Error("No hay un término ancla configurado.");
  }

  const { data: anchorPrices, error } = await supabase
    .from("product_prices")
    .select("product_id, channel, price")
    .eq("term", anchor.code);
  if (error) throw error;

  for (const ap of anchorPrices ?? []) {
    for (const term of terms) {
      if (term.code === anchor.code) continue;
      const derived = Math.round(ap.price * (1 + term.surcharge_pct / 100));
      await supabase
        .from("product_prices")
        .update({ price: derived })
        .eq("product_id", ap.product_id)
        .eq("channel", ap.channel)
        .eq("term", term.code);
    }
  }
}

// Para cada producto que aún no tenga rows del término dado, los inserta en 0.
export async function ensureAllProductsHaveTerm(termCode: string) {
  const { data: products } = await supabase.from("products").select("id");
  if (!products || products.length === 0) return;

  for (const p of products) {
    for (const ch of CHANNELS) {
      const { data: existing } = await supabase
        .from("product_prices")
        .select("id")
        .eq("product_id", p.id)
        .eq("channel", ch)
        .eq("term", termCode)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase
          .from("product_prices")
          .insert({ product_id: p.id, channel: ch, term: termCode, price: 0 });
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
