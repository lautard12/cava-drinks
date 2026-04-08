
-- A) Agregar columnas de cajero a pos_sales
ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS cashier_id uuid,
  ADD COLUMN IF NOT EXISTS cashier_name_snapshot text NOT NULL DEFAULT '';

-- B) Crear vista v_finance_movements
CREATE OR REPLACE VIEW public.v_finance_movements AS

-- PARTE A: Ventas (1 fila por cada pago)
WITH sale_payments AS (
  SELECT
    pp.id AS payment_id,
    pp.sale_id,
    pp.payment_method,
    pp.fund,
    pp.amount,
    ps.created_at,
    ps.cashier_id,
    ps.cashier_name_snapshot,
    ps.channel,
    ps.subtotal_local,
    ps.subtotal_restaurant,
    ps.delivery_fee,
    ps.total,
    (ps.subtotal_local + ps.delivery_fee) AS local_total,
    -- Naive proportional split
    CASE WHEN ps.total > 0
      THEN ROUND(pp.amount * (ps.subtotal_local + ps.delivery_fee)::numeric / ps.total)::integer
      ELSE 0
    END AS amount_local_naive,
    -- Rounding adjustment: identify last payment per sale
    ROW_NUMBER() OVER (PARTITION BY pp.sale_id ORDER BY pp.id DESC) AS rn,
    -- Running sum of naive local for all payments except last (rn=1)
    SUM(
      CASE WHEN ps.total > 0
        THEN ROUND(pp.amount * (ps.subtotal_local + ps.delivery_fee)::numeric / ps.total)::integer
        ELSE 0
      END
    ) OVER (PARTITION BY pp.sale_id) AS sum_naive_local
  FROM public.pos_payments pp
  JOIN public.pos_sales ps ON pp.sale_id = ps.id
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
  -- For last payment (rn=1): adjust to absorb rounding error
  CASE WHEN sp.rn = 1
    THEN sp.local_total - (sp.sum_naive_local - sp.amount_local_naive)
    ELSE sp.amount_local_naive
  END AS amount_local,
  -- amount_restaurant is the complement
  sp.amount - (
    CASE WHEN sp.rn = 1
      THEN sp.local_total - (sp.sum_naive_local - sp.amount_local_naive)
      ELSE sp.amount_local_naive
    END
  ) AS amount_restaurant,
  'Venta POS'::text AS description,
  'Venta ' || LEFT(sp.sale_id::text, 8) AS reference_label,
  false AS is_pass_through
FROM sale_payments sp

UNION ALL

-- PARTE B: Gastos (1 fila por expense)
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
  CASE WHEN e.is_pass_through THEN 0 ELSE e.amount END AS amount_local,
  CASE WHEN e.is_pass_through THEN e.amount ELSE 0 END AS amount_restaurant,
  COALESCE(e.category, '') || ' - ' || COALESCE(e.description, '') AS description,
  'Gasto ' || LEFT(e.id::text, 8) AS reference_label,
  e.is_pass_through
FROM public.expenses e;
