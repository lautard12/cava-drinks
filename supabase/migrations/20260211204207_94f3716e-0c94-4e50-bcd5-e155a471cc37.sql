
-- price_settings: single-row global config
CREATE TABLE public.price_settings (
  id integer NOT NULL DEFAULT 1 PRIMARY KEY,
  credit_1_pct numeric NOT NULL DEFAULT 10,
  credit_3_pct numeric NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_settings_single_row CHECK (id = 1)
);

ALTER TABLE public.price_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to price_settings"
  ON public.price_settings FOR ALL
  USING (true) WITH CHECK (true);

INSERT INTO public.price_settings (id, credit_1_pct, credit_3_pct) VALUES (1, 10, 20);

-- product_prices: 6 records per product
CREATE TABLE public.product_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel text NOT NULL,
  term text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  UNIQUE(product_id, channel, term)
);

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to product_prices"
  ON public.product_prices FOR ALL
  USING (true) WITH CHECK (true);
