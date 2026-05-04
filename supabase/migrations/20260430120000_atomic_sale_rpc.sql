-- RPCs atómicos para crear venta directa y para cerrar cuenta abierta.
-- Garantizan: (a) toda la operación en UNA sola transacción,
--             (b) lock pesimista sobre stock_balances con FOR UPDATE,
--             (c) imposible vender stock que no se tiene aunque haya 2 cajeros simultáneos.
--
-- Las funciones son SECURITY DEFINER para poder escribir en todas las tablas
-- bajo las RLS actuales (Allow all). Si en el futuro se restringen las RLS,
-- estas funciones siguen funcionando porque corren con el rol del owner.

-- ─── 1) Validación de stock + lock ─────────────────────────────────────
-- Helper: bloquea las filas de stock_balances de los productos requeridos
-- y valida que haya cantidad suficiente. Si falta, RAISE EXCEPTION (rollback).
CREATE OR REPLACE FUNCTION public._lock_and_validate_stock(p_required jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  -- p_required = [{"product_id": "...", "qty": N, "name": "..."}]
  -- Hacemos SELECT FOR UPDATE en orden de product_id para evitar deadlocks.
  FOR rec IN
    SELECT
      (e->>'product_id')::uuid AS product_id,
      (e->>'qty')::integer AS needed,
      COALESCE(e->>'name', (e->>'product_id')) AS name
    FROM jsonb_array_elements(p_required) AS e
    ORDER BY (e->>'product_id')::uuid
  LOOP
    PERFORM 1
      FROM public.stock_balances
      WHERE product_id = rec.product_id
      FOR UPDATE;

    IF (
      SELECT COALESCE(qty_on_hand, 0)
      FROM public.stock_balances
      WHERE product_id = rec.product_id
    ) < rec.needed THEN
      RAISE EXCEPTION 'Stock insuficiente para "%". Disponible: %, pedido: %',
        rec.name,
        (SELECT COALESCE(qty_on_hand, 0) FROM public.stock_balances WHERE product_id = rec.product_id),
        rec.needed;
    END IF;
  END LOOP;
END;
$$;

-- ─── 2) Aplicar deducción de stock + insertar movements ────────────────
CREATE OR REPLACE FUNCTION public._apply_stock_deduction(
  p_required jsonb,
  p_sale_id uuid,
  p_cashier_id uuid,
  p_offer_label_by_pid jsonb -- { "product_id": "Oferta XYZ" }
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
  v_reason text;
BEGIN
  FOR rec IN
    SELECT
      (e->>'product_id')::uuid AS product_id,
      (e->>'qty')::integer AS qty
    FROM jsonb_array_elements(p_required) AS e
  LOOP
    v_reason := CASE
      WHEN p_offer_label_by_pid ? rec.product_id::text
        THEN 'Venta POS — Oferta: ' || (p_offer_label_by_pid->>rec.product_id::text)
      ELSE 'Venta POS'
    END;

    INSERT INTO public.stock_movements (product_id, type, qty, reason, created_by, sale_id)
    VALUES (rec.product_id, 'SALE', rec.qty, v_reason, p_cashier_id::text, p_sale_id);

    UPDATE public.stock_balances
      SET qty_on_hand = qty_on_hand - rec.qty
      WHERE product_id = rec.product_id;
  END LOOP;
END;
$$;

-- ─── 3) Insertar pagos ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._insert_payments(
  p_sale_id uuid,
  p_payments jsonb,
  p_global_surcharge_pct numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  pay RECORD;
  v_pct numeric;
  v_amount integer;
  v_commission integer;
  v_method text;
  v_fund text;
BEGIN
  FOR pay IN
    SELECT
      (e->>'payment_method')::text AS payment_method,
      (e->>'amount')::integer AS amount,
      COALESCE((e->>'surcharge_pct')::numeric, p_global_surcharge_pct) AS line_pct,
      COALESCE((e->>'installments')::integer, 1) AS installments
    FROM jsonb_array_elements(p_payments) AS e
  LOOP
    v_method := pay.payment_method;
    v_amount := pay.amount;
    v_pct := pay.line_pct;
    v_fund := CASE WHEN v_method = 'EFECTIVO' THEN 'EFECTIVO' ELSE 'MERCADOPAGO' END;
    v_commission := CASE
      WHEN v_pct > 0 THEN ROUND(v_amount * v_pct / (100 + v_pct))::integer
      ELSE 0
    END;

    INSERT INTO public.pos_payments (
      sale_id, payment_method, fund, amount, commission_amount, commission_pct, installments
    )
    VALUES (
      p_sale_id, v_method, v_fund, v_amount, v_commission, v_pct, pay.installments
    );
  END LOOP;
END;
$$;

-- ─── 4) RPC PRINCIPAL: create_sale_atomic ──────────────────────────────
-- Reemplaza el flujo actual de pos-store.createSale.
-- Recibe todo lo necesario para una venta directa (DELIVERY), valida y persiste
-- en una transacción única. Si algo falla, rollback total.
CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_channel text,
  p_price_term text,
  p_delivery_fee integer,
  p_cashier_id uuid,
  p_cashier_name text,
  p_surcharge_pct numeric,
  p_items jsonb,            -- array de items del carrito
  p_payments jsonb,         -- array de pagos
  p_stock_required jsonb,   -- array consolidado [{product_id, qty, name}]
  p_offer_label_by_pid jsonb  -- mapa product_id → oferta_label (opcional, '{}' si no hay)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_subtotal_local integer;
  v_subtotal_restaurant integer;
  v_total integer;
  it RECORD;
  v_inserted_id uuid;
BEGIN
  IF p_cashier_id IS NULL THEN
    RAISE EXCEPTION 'No hay cajero autenticado';
  END IF;

  -- 1. Lock + validación de stock.
  PERFORM public._lock_and_validate_stock(p_stock_required);

  -- 2. Calcular subtotales desde los items (la fuente de verdad es el server).
  SELECT
    COALESCE(SUM(CASE WHEN owner = 'LOCAL' THEN unit_price * qty ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN owner = 'RESTAURANTE' THEN unit_price * qty ELSE 0 END), 0)
  INTO v_subtotal_local, v_subtotal_restaurant
  FROM (
    SELECT
      (e->>'owner')::text AS owner,
      (e->>'unit_price')::integer AS unit_price,
      (e->>'qty')::integer AS qty
    FROM jsonb_array_elements(p_items) AS e
  ) sub;

  v_total := v_subtotal_local + COALESCE(p_delivery_fee, 0) + v_subtotal_restaurant;

  -- 3. Insertar venta.
  INSERT INTO public.pos_sales (
    channel, price_term, delivery_fee, subtotal_local, subtotal_restaurant, total,
    cashier_id, cashier_name_snapshot, status
  )
  VALUES (
    p_channel, p_price_term, COALESCE(p_delivery_fee, 0),
    v_subtotal_local, v_subtotal_restaurant, v_total,
    p_cashier_id, COALESCE(p_cashier_name, ''), 'COMPLETED'
  )
  RETURNING id INTO v_sale_id;

  -- 4. Insertar items.
  FOR it IN
    SELECT
      e->>'owner' AS owner,
      e->>'item_type' AS item_type,
      NULLIF(e->>'product_id','')::uuid AS product_id,
      NULLIF(e->>'restaurant_item_id','')::uuid AS restaurant_item_id,
      e->>'name' AS name,
      COALESCE(e->>'variant','') AS variant,
      (e->>'qty')::integer AS qty,
      (e->>'unit_price')::integer AS unit_price,
      COALESCE((e->>'unit_price_base')::integer, (e->>'unit_price')::integer) AS unit_price_base,
      COALESCE(e->>'notes','') AS notes,
      COALESCE((e->>'cost_snapshot')::integer, 0) AS cost_snapshot,
      NULLIF(e->>'offer_id','')::uuid AS offer_id,
      e->>'offer_name_snapshot' AS offer_name_snapshot,
      NULLIF(e->>'offer_price_snapshot','')::integer AS offer_price_snapshot,
      e->'offer_components' AS offer_components
    FROM jsonb_array_elements(p_items) AS e
  LOOP
    INSERT INTO public.pos_sale_items (
      sale_id, owner, item_type, product_id, restaurant_item_id,
      name_snapshot, variant_snapshot, qty, unit_price, unit_price_base_snapshot,
      line_total, notes, cost_snapshot, sent_to_kitchen,
      offer_id, offer_name_snapshot, offer_price_snapshot
    )
    VALUES (
      v_sale_id, it.owner, it.item_type,
      CASE WHEN it.item_type = 'OFFER' THEN NULL ELSE it.product_id END,
      CASE WHEN it.item_type = 'OFFER' THEN NULL ELSE it.restaurant_item_id END,
      it.name, it.variant, it.qty, it.unit_price, it.unit_price_base,
      it.unit_price * it.qty, it.notes, it.cost_snapshot,
      CASE WHEN it.item_type = 'OFFER' THEN false ELSE NULL END,
      it.offer_id, it.offer_name_snapshot, it.offer_price_snapshot
    )
    RETURNING id INTO v_inserted_id;

    -- Componentes de oferta.
    IF it.item_type = 'OFFER' AND it.offer_components IS NOT NULL THEN
      INSERT INTO public.pos_sale_item_components (
        sale_item_id, product_id, name_snapshot, qty, unit_cost_snapshot, line_cost
      )
      SELECT
        v_inserted_id,
        (c->>'product_id')::uuid,
        c->>'name',
        (c->>'qty')::integer,
        (c->>'unit_cost')::integer,
        (c->>'line_cost')::integer
      FROM jsonb_array_elements(it.offer_components) AS c;
    END IF;
  END LOOP;

  -- 5. Insertar pagos (con cálculo de comisión por línea).
  PERFORM public._insert_payments(v_sale_id, p_payments, p_surcharge_pct);

  -- 6. Aplicar deducción de stock + movements.
  PERFORM public._apply_stock_deduction(p_stock_required, v_sale_id, p_cashier_id, p_offer_label_by_pid);

  RETURN v_sale_id;
END;
$$;

-- ─── 5) RPC: close_tab_atomic ──────────────────────────────────────────
-- Cierra una cuenta abierta (status='OPEN') validando stock con lock.
-- Los items ya están en pos_sale_items, así que solo necesitamos:
--   - validar y deducir stock,
--   - insertar pagos,
--   - insertar componentes de ofertas (si las cuentas las tenían),
--   - marcar como COMPLETED.
CREATE OR REPLACE FUNCTION public.close_tab_atomic(
  p_sale_id uuid,
  p_cashier_id uuid,
  p_payments jsonb,
  p_surcharge_pct numeric,
  p_stock_required jsonb,
  p_offer_label_by_pid jsonb,
  p_offer_components_by_item jsonb -- { "<sale_item_id>": [components...] }
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  rec RECORD;
BEGIN
  IF p_cashier_id IS NULL THEN
    RAISE EXCEPTION 'No hay cajero autenticado';
  END IF;

  -- Bloquea la fila de la venta para evitar cierres concurrentes de la misma cuenta.
  SELECT status INTO v_status
    FROM public.pos_sales
    WHERE id = p_sale_id
    FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'La cuenta % no existe', p_sale_id;
  END IF;
  IF v_status <> 'OPEN' THEN
    RAISE EXCEPTION 'La cuenta % ya no está abierta (status=%)', p_sale_id, v_status;
  END IF;

  -- 1. Lock + validación de stock.
  PERFORM public._lock_and_validate_stock(p_stock_required);

  -- 2. Insertar componentes de ofertas y actualizar cost_snapshot del item de oferta.
  FOR rec IN
    SELECT key AS sale_item_id, value AS components
    FROM jsonb_each(COALESCE(p_offer_components_by_item, '{}'::jsonb))
  LOOP
    INSERT INTO public.pos_sale_item_components (
      sale_item_id, product_id, name_snapshot, qty, unit_cost_snapshot, line_cost
    )
    SELECT
      rec.sale_item_id::uuid,
      (c->>'product_id')::uuid,
      c->>'name',
      (c->>'qty')::integer,
      (c->>'unit_cost')::integer,
      (c->>'line_cost')::integer
    FROM jsonb_array_elements(rec.components) AS c;

    UPDATE public.pos_sale_items
      SET cost_snapshot = (
        SELECT COALESCE(SUM((c->>'line_cost')::integer), 0)
        FROM jsonb_array_elements(rec.components) AS c
      )
      WHERE id = rec.sale_item_id::uuid;
  END LOOP;

  -- 3. Insertar pagos.
  PERFORM public._insert_payments(p_sale_id, p_payments, p_surcharge_pct);

  -- 4. Deducir stock + movements.
  PERFORM public._apply_stock_deduction(p_stock_required, p_sale_id, p_cashier_id, p_offer_label_by_pid);

  -- 5. Marcar venta como COMPLETED.
  UPDATE public.pos_sales
    SET status = 'COMPLETED',
        closed_at = now(),
        updated_at = now()
    WHERE id = p_sale_id;

  RETURN p_sale_id;
END;
$$;

-- Permisos: las funciones ya son SECURITY DEFINER, pero hay que dar EXECUTE
-- al rol authenticated y anon (la app no usa roles separados todavía).
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(text, text, integer, uuid, text, numeric, jsonb, jsonb, jsonb, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.close_tab_atomic(uuid, uuid, jsonb, numeric, jsonb, jsonb, jsonb) TO authenticated, anon;
