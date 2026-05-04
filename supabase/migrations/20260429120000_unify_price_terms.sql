-- Unifica los recargos en price_terms y elimina surcharge_tiers / price_settings.
-- El término "ancla" es el row de price_terms con sort_order = 0 Y surcharge_pct = 0.
-- A partir del precio del ancla se derivan los demás (precio_term = ancla * (1 + pct/100)).

-- 1. Asegurar que price_terms exista (idempotente — la creó la migración 20260407).
CREATE TABLE IF NOT EXISTS public.price_terms (
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_terms' AND policyname = 'Allow all access to price_terms') THEN
    CREATE POLICY "Allow all access to price_terms" ON public.price_terms FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Migrar lo que haya en surcharge_tiers a price_terms (sin pisar lo existente).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'surcharge_tiers') THEN
    INSERT INTO public.price_terms (code, label, surcharge_pct, fund, sort_order, is_active)
    SELECT
      st.slug,
      st.name,
      st.percentage,
      CASE WHEN st.percentage = 0 THEN 'EFECTIVO' ELSE 'MERCADOPAGO' END,
      st.sort_order,
      true
    FROM public.surcharge_tiers st
    WHERE NOT EXISTS (SELECT 1 FROM public.price_terms pt WHERE pt.code = st.slug);
  END IF;
END $$;

-- 3. Garantizar exactamente UN ancla (sort_order = 0 y surcharge_pct = 0).
--    Si no hay, creamos uno por defecto llamado BASE.
DO $$
DECLARE
  v_anchor_count int;
BEGIN
  SELECT count(*) INTO v_anchor_count FROM public.price_terms WHERE sort_order = 0 AND surcharge_pct = 0;
  IF v_anchor_count = 0 THEN
    -- Si existe un row BASE, normalizarlo al ancla; sino, crearlo.
    IF EXISTS (SELECT 1 FROM public.price_terms WHERE code = 'BASE') THEN
      UPDATE public.price_terms
        SET sort_order = 0, surcharge_pct = 0, fund = 'EFECTIVO', is_active = true
        WHERE code = 'BASE';
    ELSE
      INSERT INTO public.price_terms (code, label, surcharge_pct, fund, sort_order, is_active)
      VALUES ('BASE', 'Efectivo', 0, 'EFECTIVO', 0, true);
    END IF;
    -- Si había otros con sort_order=0 que no eran ancla, moverlos al final.
    UPDATE public.price_terms pt
      SET sort_order = (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.price_terms)
      WHERE sort_order = 0 AND surcharge_pct <> 0;
  ELSIF v_anchor_count > 1 THEN
    RAISE EXCEPTION 'Estado inconsistente: hay más de un ancla en price_terms. Revisar manualmente.';
  END IF;
END $$;

-- 4. Constraint único parcial: solo puede haber un row con sort_order = 0.
--    No exigimos surcharge_pct = 0 a nivel BD (eso lo valida la app), pero sí unicidad de sort_order=0.
CREATE UNIQUE INDEX IF NOT EXISTS price_terms_anchor_unique
  ON public.price_terms ((1)) WHERE sort_order = 0;

-- 5. Verificar que todos los product_prices.term tengan su contraparte en price_terms.code.
--    Si no la tienen, los borramos (no se pueden usar para nada).
DELETE FROM public.product_prices
  WHERE term NOT IN (SELECT code FROM public.price_terms);

-- 6. Sincronizar product_prices: para cada producto, asegurar un row por (channel, code de price_terms).
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.id AS product_id, ch.channel, pt.code
    FROM public.products p
    CROSS JOIN (VALUES ('RESTAURANTE'), ('DELIVERY')) AS ch(channel)
    CROSS JOIN public.price_terms pt
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_prices pp
      WHERE pp.product_id = p.id AND pp.channel = ch.channel AND pp.term = pt.code
    )
  LOOP
    INSERT INTO public.product_prices (product_id, channel, term, price)
    VALUES (rec.product_id, rec.channel, rec.code, 0);
  END LOOP;
END $$;

-- 7. Drop tablas legacy.
DROP TABLE IF EXISTS public.surcharge_tiers CASCADE;
DROP TABLE IF EXISTS public.price_settings CASCADE;
