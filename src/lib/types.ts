// ProductType is now dynamic — stored in product_types table
// This alias is kept for backward compat in code that still references it
export type ProductType = string;

export type MovementType = 'PURCHASE' | 'ADJUST' | 'WASTE' | 'SALE';

export interface Product {
  id: string;
  name: string;
  type: string;
  category: string;
  variant_label: string;
  sku: string;
  track_stock: boolean;
  min_stock: number;
  is_active: boolean;
  created_at: string;
}

export interface StockBalance {
  product_id: string;
  qty_on_hand: number;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: MovementType;
  qty: number;
  reason: string;
  created_at: string;
  created_by: string;
}

export interface ProductWithStock extends Product {
  qty_on_hand: number;
  status: 'sin_stock' | 'bajo' | 'ok';
}

export type CountStatus = 'DRAFT' | 'ADJUSTED' | 'CLOSED';

export interface InventoryCount {
  id: string;
  start_date: string;
  end_date: string;
  status: CountStatus;
  created_at: string;
  created_by: string;
  adjusted_at: string | null;
  closed_at: string | null;
  notes: string | null;
}

export interface InventoryCountLine {
  id: string;
  count_id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number | null;
  diff_qty: number | null;
  created_at: string;
  product?: Product;
}
