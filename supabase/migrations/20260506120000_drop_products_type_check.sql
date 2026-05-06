-- Drop the legacy CHECK constraint on products.type.
--
-- Contexto:
--   La migración inicial (20260210235408) definió:
--     products.type TEXT CHECK (type IN ('BEBIDAS', 'SNACKS', 'CIGARRILLOS'))
--
--   Más tarde (20260317221509) se introdujo la tabla dinámica `product_types`
--   con su propio set de tipos administrables desde /configuracion. El CHECK
--   nunca se eliminó, así que cualquier producto con un type que no esté en
--   esa lista vieja (Vinos, Gaseosas, Aguas, Panificados, Snacks reales,
--   Golosinas, Descartables, etc.) falla con products_type_check.
--
--   Este migration sincroniza el schema con la realidad: la fuente de verdad
--   de los tipos válidos es la tabla product_types, y ya no hace falta un
--   CHECK estático. La integridad se mantiene por convención del código
--   (la UI solo permite elegir tipos existentes en product_types).
--
-- Efecto:
--   - Permite insertar productos con cualquier valor de type (validado a
--     nivel app contra product_types).
--   - No afecta los productos ya cargados.
--   - El índice idx_products_type sigue intacto.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_type_check;
