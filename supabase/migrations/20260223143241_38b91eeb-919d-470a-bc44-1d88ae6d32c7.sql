
-- Add 'cocina' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cocina';

-- Enable realtime for pos_sales and pos_sale_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_sale_items;
