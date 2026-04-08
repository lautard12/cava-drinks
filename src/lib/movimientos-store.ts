import { supabase } from "@/integrations/supabase/client";

export interface FinanceMovement {
  movement_id: string;
  occurred_at: string;
  direction: string;
  movement_type: string;
  source: string;
  source_id: string;
  user_id: string | null;
  user_name: string | null;
  channel: string | null;
  payment_method: string | null;
  fund: string | null;
  amount: number;
  amount_local: number;
  amount_restaurant: number;
  description: string | null;
  reference_label: string | null;
  is_pass_through: boolean;
}

export interface MovementFilters {
  from: string;
  to: string;
  direction?: string;
  movement_type?: string;
  channel?: string;
  payment_method?: string;
  fund?: string;
  search?: string;
}

export async function fetchMovements(filters: MovementFilters): Promise<FinanceMovement[]> {
  let query = supabase
    .from("v_finance_movements")
    .select("*")
    .gte("occurred_at", `${filters.from}T00:00:00`)
    .lte("occurred_at", `${filters.to}T23:59:59`)
    .order("occurred_at", { ascending: false });

  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.movement_type) query = query.eq("movement_type", filters.movement_type);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.payment_method) query = query.eq("payment_method", filters.payment_method);
  if (filters.fund) query = query.eq("fund", filters.fund);
  if (filters.search) query = query.or(`description.ilike.%${filters.search}%,reference_label.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FinanceMovement[];
}

export async function fetchSaleDetail(saleId: string) {
  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("*")
    .eq("sale_id", saleId);

  const { data: payments } = await supabase
    .from("pos_payments")
    .select("*")
    .eq("sale_id", saleId);

  const { data: sale } = await supabase
    .from("pos_sales")
    .select("*")
    .eq("id", saleId)
    .single();

  return { sale, items: items ?? [], payments: payments ?? [] };
}

export async function fetchExpenseDetail(expenseId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", expenseId)
    .single();
  if (error) throw error;
  return data;
}
