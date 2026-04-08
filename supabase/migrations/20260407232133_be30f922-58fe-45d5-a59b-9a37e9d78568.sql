
-- Add is_active and sort_order to product_types
ALTER TABLE product_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_types ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Create product_categories (hierarchical, linked to product_types)
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type_id UUID REFERENCES product_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to product_categories" ON product_categories FOR ALL USING (true) WITH CHECK (true);

-- Create variant_sets
CREATE TABLE IF NOT EXISTS variant_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE variant_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to variant_sets" ON variant_sets FOR ALL USING (true) WITH CHECK (true);

-- Create variant_values
CREATE TABLE IF NOT EXISTS variant_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES variant_sets(id),
  value TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE variant_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to variant_values" ON variant_values FOR ALL USING (true) WITH CHECK (true);
