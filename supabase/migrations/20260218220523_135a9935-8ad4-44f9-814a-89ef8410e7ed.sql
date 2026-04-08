
-- Create expenses table
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  amount integer NOT NULL,
  payment_method text NOT NULL,
  fund text NOT NULL,
  category text,
  description text,
  is_pass_through boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'admin'
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to expenses"
  ON public.expenses FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create cash_opening_balances table
CREATE TABLE public.cash_opening_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  fund text NOT NULL,
  amount integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(date, fund)
);

ALTER TABLE public.cash_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cash_opening_balances"
  ON public.cash_opening_balances FOR ALL
  USING (true)
  WITH CHECK (true);
