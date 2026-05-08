-- Refactor del módulo de Conteo Semanal de Inventario — Parte 1: schema
-- (a) diff_qty pasa a columna GENERATED (counted_qty - system_qty).
-- (b) Nuevas columnas para categorizar el motivo de la diferencia.
-- (c) Único conteo activo (DRAFT/ADJUSTED) a la vez.
-- Las funciones (apply_inventory_count_atomic, save_inventory_count_draft) van
-- en una migration separada para evitar el bug del parser del CLI cuando se
-- mezcla DDL + CREATE FUNCTION con plpgsql complejo en el mismo archivo.

-- ── (a) diff_qty GENERATED ────────────────────────────────────────────
-- Sintaxis idéntica a cash_counts.difference (ver 20260501120000_cash_count.sql).
ALTER TABLE public.inventory_count_lines DROP COLUMN diff_qty;
ALTER TABLE public.inventory_count_lines
  ADD COLUMN diff_qty integer
  GENERATED ALWAYS AS (counted_qty - system_qty) STORED;

-- ── (b) Motivo y nota del diff ────────────────────────────────────────
ALTER TABLE public.inventory_count_lines
  ADD COLUMN diff_reason text NULL
    CHECK (diff_reason IS NULL OR diff_reason IN ('ROTURA', 'HURTO', 'ERROR_CARGA', 'VENCIMIENTO', 'OTRO')),
  ADD COLUMN diff_note text NULL;

-- ── (c) Un solo conteo activo ─────────────────────────────────────────
-- Si existe un conteo en DRAFT o ADJUSTED, no se puede crear otro hasta
-- cerrarlo (CLOSED) o borrarlo. Conteos CLOSED no cuentan para esta restricción.
CREATE UNIQUE INDEX inventory_counts_one_active
  ON public.inventory_counts ((1))
  WHERE status IN ('DRAFT', 'ADJUSTED');
