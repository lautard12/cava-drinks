
-- 1. Rename surcharge_amount → commission_amount and add new columns to pos_payments
ALTER TABLE public.pos_payments RENAME COLUMN surcharge_amount TO commission_amount;
ALTER TABLE public.pos_payments ADD COLUMN commission_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.pos_payments ADD COLUMN installments integer NOT NULL DEFAULT 1;

-- 2. Create fund_movements table
CREATE TABLE public.fund_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  fund text NOT NULL,
  amount integer NOT NULL,
  type text NOT NULL DEFAULT 'INGRESO',
  description text,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fund_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to fund_movements" ON public.fund_movements FOR ALL USING (true) WITH CHECK (true);

-- 3. Create stock_purchases table
CREATE TABLE public.stock_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_name_snapshot text NOT NULL DEFAULT '',
  payment_fund text NOT NULL DEFAULT 'EFECTIVO',
  payment_method text NOT NULL DEFAULT 'EFECTIVO',
  total_amount integer NOT NULL DEFAULT 0,
  notes text,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to stock_purchases" ON public.stock_purchases FOR ALL USING (true) WITH CHECK (true);

-- 4. Create price_terms table
CREATE TABLE public.price_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  surcharge_pct numeric NOT NULL DEFAULT 0,
  default_installments integer,
  fund text NOT NULL DEFAULT 'EFECTIVO',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.price_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to price_terms" ON public.price_terms FOR ALL USING (true) WITH CHECK (true);

-- 5. Add source_stock_movement_id to expenses
ALTER TABLE public.expenses ADD COLUMN source_stock_movement_id uuid;

-- 6. Recreate v_finance_movements with commission_amount
DROP VIEW IF EXISTS public.v_finance_movements;
CREATE OR REPLACE VIEW public.v_finance_movements AS
WITH sale_payments AS (
  SELECT
    pp.id AS payment_id,
    pp.sale_id,
    pp.payment_method,
    pp.fund,
    pp.amount,
    pp.commission_amount,
    pp.commission_pct,
    pp.installments,
    ps.created_at,
    ps.cashier_id,
    ps.cashier_name_snapshot,
    ps.channel,
    ps.subtotal_local,
    ps.subtotal_restaurant,
    ps.delivery_fee,
    ps.total,
    (ps.subtotal_local + ps.delivery_fee) AS local_total,
    CASE WHEN ps.total > 0
      THEN ROUND(pp.amount::numeric * (ps.subtotal_local + ps.delivery_fee)::numeric / ps.total::numeric)::integer
      ELSE 0
    END AS amount_local_naive,
    ROW_NUMBER() OVER (PARTITION BY pp.sale_id ORDER BY pp.id DESC) AS rn,
    SUM(
      CASE WHEN ps.total > 0
        THEN ROUND(pp.amount::numeric * (ps.subtotal_local + ps.delivery_fee)::numeric / ps.total::numeric)::integer
        ELSE 0
      END
    ) OVER (PARTITION BY pp.sale_id) AS sum_naive_local
  FROM pos_payments pp
  JOIN pos_sales ps ON pp.sale_id = ps.id
  WHERE ps.status = 'COMPLETED'
)
SELECT
  sp.payment_id::text AS movement_id,
  sp.created_at AS occurred_at,
  'IN'::text AS direction,
  'SALE'::text AS movement_type,
  'POS_PAYMENT'::text AS source,
  sp.sale_id AS source_id,
  sp.cashier_id::text AS user_id,
  sp.cashier_name_snapshot AS user_name,
  sp.channel,
  sp.payment_method,
  sp.fund,
  sp.amount,
  CASE
    WHEN sp.rn = 1 THEN sp.local_total - (sp.sum_naive_local - sp.amount_local_naive)
    ELSE sp.amount_local_naive::bigint
  END AS amount_local,
  sp.amount - CASE
    WHEN sp.rn = 1 THEN sp.local_total - (sp.sum_naive_local - sp.amount_local_naive)
    ELSE sp.amount_local_naive::bigint
  END AS amount_restaurant,
  'Venta POS'::text AS description,
  ('Venta ' || LEFT(sp.sale_id::text, 8))::text AS reference_label,
  false AS is_pass_through
FROM sale_payments sp

UNION ALL

SELECT
  e.id::text AS movement_id,
  (e.date::text || 'T12:00:00')::timestamptz AS occurred_at,
  'OUT'::text AS direction,
  'EXPENSE'::text AS movement_type,
  'EXPENSE'::text AS source,
  e.id AS source_id,
  e.created_by AS user_id,
  e.created_by AS user_name,
  NULL::text AS channel,
  e.payment_method,
  e.fund,
  e.amount,
  e.amount AS amount_local,
  0 AS amount_restaurant,
  COALESCE(e.description, e.category, 'Gasto') AS description,
  COALESCE(e.category, 'Gasto') AS reference_label,
  e.is_pass_through
FROM expenses e;
