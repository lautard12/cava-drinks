import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────

export interface ProductType {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  sku_prefix: string;
  units: string[];
}

export interface ProductCategory {
  id: string;
  name: string;
  type_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface VariantSet {
  id: string;
  name: string;
  is_active: boolean;
}

export interface VariantValue {
  id: string;
  set_id: string;
  value: string;
  is_active: boolean;
  sort_order: number;
}

export interface PriceTerm {
  id: string;
  code: string;
  label: string;
  surcharge_pct: number;
  default_installments: number | null;
  fund: string;
  sort_order: number;
  is_active: boolean;
}

// ─── Product Types ───────────────────────────────────────

export async function fetchTypes(): Promise<ProductType[]> {
  const { data, error } = await supabase
    .from("product_types")
    .select("id, name, is_active, sort_order, sku_prefix, units")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ProductType[];
}

export async function createType(name: string, units: string[] = []) {
  const { error } = await supabase.from("product_types").insert({ name, units });
  if (error) throw error;
}

export async function updateType(
  id: string,
  updates: Partial<Pick<ProductType, "name" | "is_active" | "sort_order" | "units">>
) {
  const { error } = await supabase.from("product_types").update(updates).eq("id", id);
  if (error) throw error;
}

// ─── Product Categories ──────────────────────────────────

export async function fetchCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name, type_id, is_active, sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ProductCategory[];
}

export async function createCategory(name: string, type_id: string | null) {
  const { error } = await supabase.from("product_categories").insert({ name, type_id: type_id || null });
  if (error) throw error;
}

export async function updateCategory(
  id: string,
  updates: Partial<Pick<ProductCategory, "name" | "type_id" | "is_active" | "sort_order">>
) {
  const { error } = await supabase.from("product_categories").update(updates).eq("id", id);
  if (error) throw error;
}

// ─── Variant Sets ────────────────────────────────────────

export async function fetchVariantSets(): Promise<VariantSet[]> {
  const { data, error } = await supabase
    .from("variant_sets")
    .select("id, name, is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as VariantSet[];
}

export async function createVariantSet(name: string): Promise<string> {
  const { data, error } = await supabase
    .from("variant_sets").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function updateVariantSet(
  id: string,
  updates: Partial<Pick<VariantSet, "name" | "is_active">>
) {
  const { error } = await supabase.from("variant_sets").update(updates).eq("id", id);
  if (error) throw error;
}

// ─── Variant Values ──────────────────────────────────────

export async function fetchVariantValues(setId: string): Promise<VariantValue[]> {
  const { data, error } = await supabase
    .from("variant_values")
    .select("id, set_id, value, is_active, sort_order")
    .eq("set_id", setId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as VariantValue[];
}

export async function createVariantValue(set_id: string, value: string) {
  const { error } = await supabase.from("variant_values").insert({ set_id, value });
  if (error) throw error;
}

export async function updateVariantValue(
  id: string,
  updates: Partial<Pick<VariantValue, "value" | "is_active" | "sort_order">>
) {
  const { error } = await supabase.from("variant_values").update(updates).eq("id", id);
  if (error) throw error;
}

// ─── Price Terms ─────────────────────────────────────────

export async function fetchPriceTerms(): Promise<PriceTerm[]> {
  const { data, error } = await supabase
    .from("price_terms")
    .select("id, code, label, surcharge_pct, default_installments, fund, sort_order, is_active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as PriceTerm[];
}

export async function createPriceTerm(term: {
  code: string; label: string; surcharge_pct: number;
  default_installments: number | null; fund: string; sort_order: number;
}) {
  const { error } = await supabase.from("price_terms").insert(term);
  if (error) throw error;
}

export async function updatePriceTerm(
  id: string,
  updates: Partial<Omit<PriceTerm, "id">>
) {
  const { error } = await supabase.from("price_terms").update(updates).eq("id", id);
  if (error) throw error;
}
