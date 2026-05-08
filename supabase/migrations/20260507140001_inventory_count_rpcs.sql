CREATE OR REPLACE FUNCTION public.apply_inventory_count_atomic(p_count_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_start_date date;
  v_end_date date;
  rec RECORD;
  v_reason text;
BEGIN
  SELECT status, start_date, end_date
    INTO v_status, v_start_date, v_end_date
    FROM public.inventory_counts
    WHERE id = p_count_id
    FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'count not found';
  ELSIF v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'count not in DRAFT';
  END IF;

  PERFORM 1
    FROM public.stock_balances sb
    WHERE sb.product_id IN (
      SELECT product_id FROM public.inventory_count_lines
      WHERE count_id = p_count_id AND counted_qty IS NOT NULL
    )
    ORDER BY sb.product_id
    FOR UPDATE;

  FOR rec IN
    SELECT id, product_id, system_qty, counted_qty, diff_qty, diff_reason, diff_note
    FROM public.inventory_count_lines
    WHERE count_id = p_count_id AND counted_qty IS NOT NULL
    ORDER BY product_id
  LOOP
    IF rec.diff_qty <> 0 THEN
      IF rec.diff_reason IS NULL THEN
        RAISE EXCEPTION 'missing reason';
      END IF;

      v_reason := 'Conteo ' || v_start_date::text || '..' || v_end_date::text
                || ' | ' || rec.diff_reason
                || COALESCE(': ' || NULLIF(rec.diff_note, ''), '');

      INSERT INTO public.stock_movements (product_id, type, qty, reason, created_by)
      VALUES (rec.product_id, 'ADJUST', rec.diff_qty, v_reason, 'admin');
    END IF;

    INSERT INTO public.stock_balances (product_id, qty_on_hand)
    VALUES (rec.product_id, rec.counted_qty)
    ON CONFLICT (product_id) DO UPDATE
      SET qty_on_hand = EXCLUDED.qty_on_hand;
  END LOOP;

  UPDATE public.inventory_counts
    SET status = 'ADJUSTED', adjusted_at = now()
    WHERE id = p_count_id;
END;
$$;
