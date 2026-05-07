-- Estado intermedio IN_PROGRESS para cocina + timer preciso de "lleva cocinandose hace X"
-- Ver: src/pages/Cocina.tsx (panel de cocina)

ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL;

ALTER TABLE pos_sale_items
  DROP CONSTRAINT IF EXISTS pos_sale_items_kitchen_state_check;

ALTER TABLE pos_sale_items
  ADD CONSTRAINT pos_sale_items_kitchen_state_check
  CHECK (kitchen_state IN ('PENDING','IN_PROGRESS','DELIVERED'));

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_kitchen_state
  ON pos_sale_items (kitchen_batch_id, kitchen_state)
  WHERE kitchen_batch_id IS NOT NULL;
