
-- 1. Agregar precio de costo a productos
ALTER TABLE public.products
ADD COLUMN cost_price integer NOT NULL DEFAULT 0;

-- 2. Agregar costo congelado al momento de la venta
ALTER TABLE public.pos_sale_items
ADD COLUMN cost_snapshot integer NOT NULL DEFAULT 0;

-- 3. Agregar monto de recargo (retención) en pagos
ALTER TABLE public.pos_payments
ADD COLUMN surcharge_amount integer NOT NULL DEFAULT 0;
