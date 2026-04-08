
-- Table: inventory_counts
CREATE TABLE public.inventory_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'admin',
  adjusted_at timestamptz NULL,
  closed_at timestamptz NULL,
  notes text NULL,
  UNIQUE(start_date, end_date)
);

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to inventory_counts"
  ON public.inventory_counts FOR ALL
  USING (true) WITH CHECK (true);

-- Table: inventory_count_lines
CREATE TABLE public.inventory_count_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  system_qty integer NOT NULL,
  counted_qty integer NULL,
  diff_qty integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(count_id, product_id)
);

ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to inventory_count_lines"
  ON public.inventory_count_lines FOR ALL
  USING (true) WITH CHECK (true);
