
-- 1. Suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  lead_time_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

-- 2. Stock purchase items table
CREATE TABLE public.stock_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.stock_purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to stock_purchase_items" ON public.stock_purchase_items FOR ALL USING (true) WITH CHECK (true);

-- 3. Add supplier_id FK to stock_purchases
ALTER TABLE public.stock_purchases ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id);

-- 4. Add supplier_id FK to stock_movements
ALTER TABLE public.stock_movements ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id);

-- 5. Trigger to validate payment_fund on stock_purchases
CREATE OR REPLACE FUNCTION public.validate_payment_method_fund()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.payment_fund NOT IN ('EFECTIVO', 'MERCADOPAGO') THEN
    RAISE EXCEPTION 'fund must be EFECTIVO or MERCADOPAGO';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_stock_purchase_fund
  BEFORE INSERT OR UPDATE ON public.stock_purchases
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_method_fund();
