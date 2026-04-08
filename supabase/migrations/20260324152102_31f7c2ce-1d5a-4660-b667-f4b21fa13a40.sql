
-- 1. Create offers table
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('QUANTITY', 'COMBO')),
  offer_price integer NOT NULL CHECK (offer_price > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text NOT NULL DEFAULT 'admin'
);
CREATE INDEX idx_offers_is_active ON public.offers (is_active);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to offers" ON public.offers FOR ALL USING (true) WITH CHECK (true);

-- 2. Create offer_items table
CREATE TABLE public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty integer NOT NULL CHECK (qty >= 1),
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to offer_items" ON public.offer_items FOR ALL USING (true) WITH CHECK (true);

-- 3. Create pos_sale_item_components table
CREATE TABLE public.pos_sale_item_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL REFERENCES public.pos_sale_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  name_snapshot text NOT NULL,
  qty integer NOT NULL,
  unit_cost_snapshot integer NOT NULL DEFAULT 0,
  line_cost integer NOT NULL DEFAULT 0
);
ALTER TABLE public.pos_sale_item_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to pos_sale_item_components" ON public.pos_sale_item_components FOR ALL USING (true) WITH CHECK (true);

-- 4. Add offer columns to pos_sale_items
ALTER TABLE public.pos_sale_items ADD COLUMN offer_id uuid NULL;
ALTER TABLE public.pos_sale_items ADD COLUMN offer_name_snapshot text NULL;
ALTER TABLE public.pos_sale_items ADD COLUMN offer_price_snapshot integer NULL;

-- 5. Add sale_id to stock_movements
ALTER TABLE public.stock_movements ADD COLUMN sale_id uuid NULL;
