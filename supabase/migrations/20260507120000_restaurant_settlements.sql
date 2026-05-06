-- Tabla dedicada para rendiciones al dueño del restaurante.
-- Reemplaza el patrón anterior de registrar la rendición como expense con
-- is_pass_through=true y category='Rendición restaurante'. Los registros viejos
-- siguen sumando al "rendido" durante la transición (ver finanzas-store.ts).

CREATE TABLE public.restaurant_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  fund text NOT NULL CHECK (fund IN ('EFECTIVO', 'MERCADOPAGO')),
  notes text,
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_restaurant_settlements_date
  ON public.restaurant_settlements(date)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_restaurant_settlements_fund
  ON public.restaurant_settlements(fund)
  WHERE deleted_at IS NULL;

ALTER TABLE public.restaurant_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to restaurant_settlements"
  ON public.restaurant_settlements
  FOR ALL USING (true) WITH CHECK (true);

-- Extender v_finance_movements para incluir las rendiciones nuevas
-- (la página /movimientos las muestra como salida tipo SETTLEMENT).
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
FROM expenses e
WHERE e.deleted_at IS NULL

UNION ALL

SELECT
  rs.id::text AS movement_id,
  (rs.date::text || 'T12:00:00')::timestamptz AS occurred_at,
  'OUT'::text AS direction,
  'SETTLEMENT'::text AS movement_type,
  'RESTAURANT_SETTLEMENT'::text AS source,
  rs.id AS source_id,
  rs.created_by AS user_id,
  rs.created_by AS user_name,
  NULL::text AS channel,
  NULL::text AS payment_method,
  rs.fund,
  rs.amount,
  0 AS amount_local,
  rs.amount AS amount_restaurant,
  COALESCE(rs.notes, 'Rendición al restaurante') AS description,
  'Rendición restaurante'::text AS reference_label,
  true AS is_pass_through
FROM restaurant_settlements rs
WHERE rs.deleted_at IS NULL;
