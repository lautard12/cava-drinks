ALTER TABLE public.inventory_count_lines
  ADD COLUMN IF NOT EXISTS diff_reason text NULL,
  ADD COLUMN IF NOT EXISTS diff_note text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_count_lines_diff_reason_check'
  ) THEN
    ALTER TABLE public.inventory_count_lines
      ADD CONSTRAINT inventory_count_lines_diff_reason_check
      CHECK (diff_reason IS NULL OR diff_reason IN ('ROTURA', 'HURTO', 'ERROR_CARGA', 'VENCIMIENTO', 'OTRO'));
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_counts_one_active
  ON public.inventory_counts ((1))
  WHERE status IN ('DRAFT', 'ADJUSTED');
