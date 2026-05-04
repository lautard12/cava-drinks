-- Arqueo de caja: el cajero ingresa al cierre del día cuánto contó
-- físicamente por fondo. La diferencia (contado − esperado) queda registrada.
-- Una sola fila por (date, fund) — UPSERT para permitir corregir errores.

CREATE TABLE IF NOT EXISTS public.cash_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  fund text NOT NULL,
  expected_amount integer NOT NULL,        -- saldo esperado al cierre (snapshot)
  counted_amount integer NOT NULL,          -- lo que contó el cajero
  difference integer GENERATED ALWAYS AS (counted_amount - expected_amount) STORED,
  notes text,
  counted_by uuid,                          -- auth user id
  counted_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_counts_unique_per_day UNIQUE (date, fund)
);

ALTER TABLE public.cash_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to cash_counts"
  ON public.cash_counts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cash_counts_date ON public.cash_counts(date DESC);
