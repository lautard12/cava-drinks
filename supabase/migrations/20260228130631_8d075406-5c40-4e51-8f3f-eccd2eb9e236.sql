-- Add base price snapshot column to pos_sale_items
ALTER TABLE public.pos_sale_items
ADD COLUMN unit_price_base_snapshot integer NOT NULL DEFAULT 0;

-- Backfill: for existing rows, set base = charged (unit_price) since we don't have historical data
UPDATE public.pos_sale_items SET unit_price_base_snapshot = unit_price;
