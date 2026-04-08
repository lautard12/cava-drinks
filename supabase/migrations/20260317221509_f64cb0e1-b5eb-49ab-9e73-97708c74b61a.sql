
-- Create product_types table for dynamic product types
CREATE TABLE IF NOT EXISTS product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sku_prefix text NOT NULL DEFAULT '',
  units text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to product_types" ON product_types FOR ALL USING (true) WITH CHECK (true);

INSERT INTO product_types (name, sku_prefix, units) VALUES
  ('BEBIDAS', 'BEB', ARRAY['ml', 'L']),
  ('SNACKS', 'SNK', ARRAY['g', 'kg']),
  ('CIGARRILLOS', 'CIG', ARRAY['unidades']);

-- Create surcharge_tiers table for dynamic credit/debit percentages
CREATE TABLE IF NOT EXISTS surcharge_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  percentage numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE surcharge_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to surcharge_tiers" ON surcharge_tiers FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing percentages from price_settings
INSERT INTO surcharge_tiers (name, slug, percentage, sort_order)
SELECT 'Débito', 'DEBITO', debit_pct, 1 FROM price_settings WHERE id = 1;
INSERT INTO surcharge_tiers (name, slug, percentage, sort_order)
SELECT 'Crédito 1 cuota', 'CREDITO_1', credit_1_pct, 2 FROM price_settings WHERE id = 1;
INSERT INTO surcharge_tiers (name, slug, percentage, sort_order)
SELECT 'Crédito 3 cuotas', 'CREDITO_3', credit_3_pct, 3 FROM price_settings WHERE id = 1;
