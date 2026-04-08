
-- Create pos_sales table
CREATE TABLE public.pos_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'admin',
  channel TEXT NOT NULL,
  price_term TEXT NOT NULL,
  delivery_fee INT NOT NULL DEFAULT 0,
  subtotal_local INT NOT NULL DEFAULT 0,
  subtotal_restaurant INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED'
);

ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to pos_sales" ON public.pos_sales FOR ALL USING (true) WITH CHECK (true);

-- Create pos_sale_items table
CREATE TABLE public.pos_sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  item_type TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id),
  restaurant_item_id UUID REFERENCES public.restaurant_items(id),
  name_snapshot TEXT NOT NULL,
  variant_snapshot TEXT NOT NULL DEFAULT '',
  qty INT NOT NULL,
  unit_price INT NOT NULL,
  line_total INT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to pos_sale_items" ON public.pos_sale_items FOR ALL USING (true) WITH CHECK (true);

-- Create pos_payments table
CREATE TABLE public.pos_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  fund TEXT NOT NULL,
  amount INT NOT NULL
);

ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to pos_payments" ON public.pos_payments FOR ALL USING (true) WITH CHECK (true);
