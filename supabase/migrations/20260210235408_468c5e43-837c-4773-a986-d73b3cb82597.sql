
-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BEBIDAS', 'SNACKS', 'CIGARRILLOS')),
  category TEXT NOT NULL DEFAULT '',
  variant_label TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  track_stock BOOLEAN NOT NULL DEFAULT true,
  min_stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Stock balances table
CREATE TABLE public.stock_balances (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE PRIMARY KEY,
  qty_on_hand INTEGER NOT NULL DEFAULT 0
);

-- Stock movements table
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PURCHASE', 'ADJUST', 'WASTE', 'SALE')),
  qty INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'admin'
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (no auth yet - will be tightened later)
CREATE POLICY "Allow all access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to stock_balances" ON public.stock_balances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to stock_movements" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_products_type ON public.products(type);
CREATE INDEX idx_products_active ON public.products(is_active);
CREATE INDEX idx_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_movements_created ON public.stock_movements(created_at DESC);
