-- Agregar rango de período cubierto por la rendición.
-- Permite generar un recibo con el detalle de qué tickets/platos cubre el pago.
-- Nullable porque las rendiciones existentes no tienen este dato.

ALTER TABLE public.restaurant_settlements
  ADD COLUMN period_from date,
  ADD COLUMN period_to date,
  ADD CONSTRAINT restaurant_settlements_period_order_chk
    CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to);
