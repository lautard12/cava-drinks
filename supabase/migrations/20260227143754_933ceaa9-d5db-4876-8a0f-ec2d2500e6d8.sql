
-- pos_sales: new columns for open tabs
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS tab_name text;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS opened_at timestamptz DEFAULT now();
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- pos_sale_items: kitchen tracking
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS sent_to_kitchen boolean DEFAULT false;
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS sent_at timestamptz;
