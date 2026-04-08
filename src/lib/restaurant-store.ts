import { supabase } from "@/integrations/supabase/client";

// ---------- Categories ----------

export async function fetchRestaurantCategories() {
  const { data, error } = await supabase
    .from("restaurant_categories")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function addRestaurantCategory(name: string) {
  const { data, error } = await supabase
    .from("restaurant_categories")
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRestaurantCategory(id: string, updates: { name?: string; sort_order?: number; is_active?: boolean }) {
  const { error } = await supabase
    .from("restaurant_categories")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRestaurantCategory(id: string) {
  const { error } = await supabase
    .from("restaurant_categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- Items ----------

export async function fetchRestaurantItems() {
  const { data, error } = await supabase
    .from("restaurant_items")
    .select("*, restaurant_categories(name)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    ...item,
    category_name: item.restaurant_categories?.name ?? "",
    restaurant_categories: undefined,
  }));
}

export async function addRestaurantItem(data: {
  name: string;
  category_id: string | null;
  price: number;
  description: string;
  is_active: boolean;
}) {
  const { data: item, error } = await supabase
    .from("restaurant_items")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return item;
}

export async function updateRestaurantItem(id: string, data: Record<string, any>) {
  const { error } = await supabase
    .from("restaurant_items")
    .update(data)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteRestaurantItem(id: string) {
  const { error } = await supabase
    .from("restaurant_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function duplicateRestaurantItem(id: string) {
  const { data: src, error: fetchErr } = await supabase
    .from("restaurant_items")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !src) throw fetchErr;

  const { id: _id, created_at: _ca, ...rest } = src;
  const dup = { ...rest, name: src.name + " (copia)" };

  const { data: newItem, error } = await supabase
    .from("restaurant_items")
    .insert(dup)
    .select()
    .single();
  if (error) throw error;
  return newItem;
}
