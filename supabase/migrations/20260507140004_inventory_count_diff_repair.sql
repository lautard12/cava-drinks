-- Garantiza que diff_qty es una columna GENERATED.
-- Si la migration anterior se aplicó parcialmente, puede haber quedado como
-- columna nullable normal sin la fórmula. En ese caso diff_qty queda NULL y
-- la RPC apply_inventory_count_atomic no detecta diferencias.

DO $$
DECLARE
  v_is_generated text;
BEGIN
  SELECT is_generated INTO v_is_generated
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'inventory_count_lines'
    AND column_name = 'diff_qty';

  IF v_is_generated IS DISTINCT FROM 'ALWAYS' THEN
    EXECUTE 'ALTER TABLE public.inventory_count_lines DROP COLUMN IF EXISTS diff_qty';
    EXECUTE 'ALTER TABLE public.inventory_count_lines
             ADD COLUMN diff_qty integer
             GENERATED ALWAYS AS (counted_qty - system_qty) STORED';
  END IF;
END$$;
