-- ════════════════════════════════════════════════════════════════════════
-- Refactor de FINANZAS · CAJA · COMPRAS
-- Alinea el esquema con el modelo del proyecto retail (sin señas, sin
-- clientes, manteniendo el flujo restaurante existente).
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- 1) pos_payments.created_at
--    Lo agregamos por higiene/futuro (no hay señas hoy, así que en
--    finanzas seguimos atribuyendo por pos_sales.created_at).
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE pos_payments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pos_payments_sale_id ON pos_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_created_at ON pos_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_payments_fund ON pos_payments(fund);

-- ────────────────────────────────────────────────────────────────────────
-- 2) stock_movements.purchase_id (FK con CASCADE) + índices
--    Permite borrar una compra y que se borren sus movimientos en cadena.
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES stock_purchases(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_stock_movements_purchase_id ON stock_movements(purchase_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);

-- ────────────────────────────────────────────────────────────────────────
-- 3) Soft delete en expenses y fund_movements
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE fund_movements
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_fund ON expenses(fund) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fund_movements_date ON fund_movements(date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fund_movements_fund ON fund_movements(fund) WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 4) pos_sale_items: descuentos
--    item_type ya es text (admite 'PRODUCT' | 'OFFER' | 'DISCOUNT' sin migración).
--    Sólo agregamos promotion_id (nullable, sin FK porque no hay tabla promotions todavía).
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS promotion_id UUID;

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale_id ON pos_sale_items(sale_id);

-- ────────────────────────────────────────────────────────────────────────
-- 5) Índices auxiliares para performance de finanzas
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pos_sales_created_at ON pos_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_sales_status ON pos_sales(status);
CREATE INDEX IF NOT EXISTS idx_stock_purchases_purchase_date ON stock_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_stock_purchases_payment_fund ON stock_purchases(payment_fund);
CREATE INDEX IF NOT EXISTS idx_cash_opening_balances_date_fund ON cash_opening_balances(date, fund);

-- ════════════════════════════════════════════════════════════════════════
-- RPCs
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- decrement_stock(product_id, qty)
--    Helper simple — útil para descontar stock desde el cliente sin race.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id UUID, p_qty INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO stock_balances (product_id, qty_on_hand)
  VALUES (p_product_id, -p_qty)
  ON CONFLICT (product_id)
  DO UPDATE SET qty_on_hand = stock_balances.qty_on_hand - p_qty;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- create_purchase(...)
--    Atómica: header + items + movimientos + balances (+ opcional update cost_price).
--    p_items: jsonb array de { product_id (uuid), qty (int), unit_cost (int) }
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_purchase(
  p_purchase_date          DATE,
  p_supplier_id            UUID,
  p_supplier_name_snapshot TEXT,
  p_payment_fund           TEXT,
  p_payment_method         TEXT,
  p_notes                  TEXT,
  p_items                  JSONB,
  p_update_cost_prices     BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id UUID;
  v_total INT;
  v_user UUID := auth.uid();
  v_item RECORD;
BEGIN
  -- Total = sum(qty * unit_cost)
  SELECT COALESCE(SUM((it->>'qty')::INT * (it->>'unit_cost')::INT), 0)
    INTO v_total
  FROM jsonb_array_elements(p_items) AS it;

  -- Header
  INSERT INTO stock_purchases (
    purchase_date, supplier_id, supplier_name_snapshot,
    payment_fund, payment_method, notes, total_amount, created_by
  ) VALUES (
    p_purchase_date, p_supplier_id, COALESCE(p_supplier_name_snapshot, ''),
    p_payment_fund, COALESCE(p_payment_method, ''), p_notes, v_total,
    COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  RETURNING id INTO v_purchase_id;

  -- Items, movements, balances
  FOR v_item IN
    SELECT
      (it->>'product_id')::UUID AS product_id,
      (it->>'qty')::INT         AS qty,
      (it->>'unit_cost')::INT   AS unit_cost
    FROM jsonb_array_elements(p_items) AS it
  LOOP
    -- Item
    INSERT INTO stock_purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
    VALUES (v_purchase_id, v_item.product_id, v_item.qty, v_item.unit_cost, v_item.qty * v_item.unit_cost);

    -- Movimiento de stock
    INSERT INTO stock_movements (
      product_id, type, qty, reason, supplier_id, purchase_id, created_by
    ) VALUES (
      v_item.product_id, 'PURCHASE', v_item.qty, 'Compra a proveedor',
      p_supplier_id, v_purchase_id,
      COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
    );

    -- Balance (upsert sumando)
    INSERT INTO stock_balances (product_id, qty_on_hand)
    VALUES (v_item.product_id, v_item.qty)
    ON CONFLICT (product_id)
    DO UPDATE SET qty_on_hand = stock_balances.qty_on_hand + EXCLUDED.qty_on_hand;

    -- Si pidieron actualizar cost_price del producto
    IF p_update_cost_prices THEN
      UPDATE products SET cost_price = v_item.unit_cost WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  RETURN v_purchase_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- delete_purchase(purchase_id)
--    Atómica: revierte stock + borra (CASCADE de items y movimientos por FK).
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_purchase(p_purchase_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Revertir stock_balances por cada item de la compra
  FOR v_item IN
    SELECT product_id, qty FROM stock_purchase_items WHERE purchase_id = p_purchase_id
  LOOP
    UPDATE stock_balances
       SET qty_on_hand = qty_on_hand - v_item.qty
     WHERE product_id = v_item.product_id;
  END LOOP;

  -- Borrar la compra (CASCADE borra items y movimientos)
  DELETE FROM stock_purchases WHERE id = p_purchase_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- Permisos: las RPC se invocan desde el cliente con el rol authenticated.
-- ────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION decrement_stock(UUID, INT)         TO authenticated;
GRANT EXECUTE ON FUNCTION create_purchase(DATE, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_purchase(UUID)              TO authenticated;
