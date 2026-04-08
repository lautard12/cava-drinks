
-- Restaurant categories
CREATE TABLE public.restaurant_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to restaurant_categories"
  ON public.restaurant_categories FOR ALL
  USING (true) WITH CHECK (true);

-- Restaurant items (platos)
CREATE TABLE public.restaurant_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.restaurant_categories(id) ON DELETE SET NULL,
  price INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to restaurant_items"
  ON public.restaurant_items FOR ALL
  USING (true) WITH CHECK (true);
