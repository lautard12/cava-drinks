CREATE OR REPLACE FUNCTION public.save_inventory_count_draft(
  p_count_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.inventory_count_lines AS l
  SET counted_qty = NULLIF(e->>'counted_qty', '')::integer,
      diff_reason = NULLIF(e->>'diff_reason', ''),
      diff_note = NULLIF(e->>'diff_note', '')
  FROM jsonb_array_elements(p_lines) AS e
  WHERE l.id = (e->>'id')::uuid
    AND l.count_id = p_count_id;
END;
$$;
