import { supabase } from "@/integrations/supabase/client";

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  lead_time_days: number | null;
  created_at: string;
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function createSupplier(
  name: string,
  phone = "",
  leadTimeDays?: number | null,
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name, phone, lead_time_days: leadTimeDays ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as Supplier;
}

export async function updateSupplier(
  id: string,
  updates: Partial<Omit<Supplier, "id" | "created_at">>,
) {
  const { error } = await supabase
    .from("suppliers")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSupplier(id: string) {
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
