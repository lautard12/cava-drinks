import { supabase } from "@/integrations/supabase/client";
import type { Fund } from "./finanzas-store";
import { RENDICION_CATEGORY } from "./finanzas-store";

export interface RestaurantSettlement {
  id: string;
  date: string;
  amount: number;
  fund: Fund;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchSettlementsRange(
  from: string,
  to: string,
): Promise<RestaurantSettlement[]> {
  const { data, error } = await supabase
    .from("restaurant_settlements")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RestaurantSettlement[];
}

export async function createSettlement(input: {
  date: string;
  amount: number;
  fund: Fund;
  notes: string;
}) {
  const { error } = await supabase.from("restaurant_settlements").insert({
    date: input.date,
    amount: input.amount,
    fund: input.fund,
    notes: input.notes || null,
  });
  if (error) throw error;
}

export async function deleteSettlement(id: string) {
  const { error } = await supabase
    .from("restaurant_settlements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// Suma histórica de lo rendido al restaurante hasta `toDate` inclusive.
// Combina la tabla nueva con los expenses pass-through legacy de la categoría
// reservada — ambos siguen siendo válidos durante la transición.
export async function fetchTotalSettledUntil(toDate: string): Promise<number> {
  const [newRes, legacyRes] = await Promise.all([
    supabase
      .from("restaurant_settlements")
      .select("amount")
      .lte("date", toDate)
      .is("deleted_at", null),
    supabase
      .from("expenses")
      .select("amount")
      .eq("category", RENDICION_CATEGORY)
      .eq("is_pass_through", true)
      .lte("date", toDate)
      .is("deleted_at", null),
  ]);
  if (newRes.error) throw newRes.error;
  if (legacyRes.error) throw legacyRes.error;

  const fromNew = (newRes.data ?? []).reduce((s, r) => s + r.amount, 0);
  const fromLegacy = (legacyRes.data ?? []).reduce((s, r) => s + r.amount, 0);
  return fromNew + fromLegacy;
}
