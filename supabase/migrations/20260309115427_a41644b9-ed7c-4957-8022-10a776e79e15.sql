
ALTER TABLE public.pos_sale_items
  ADD COLUMN IF NOT EXISTS kitchen_batch_id uuid NULL,
  ADD COLUMN IF NOT EXISTS kitchen_state text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NULL;
