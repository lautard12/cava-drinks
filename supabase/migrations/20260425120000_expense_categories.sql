-- ════════════════════════════════════════════════════════════════════════
-- Tabla expense_categories — categorías de gasto configurables
--
-- Decisión: categoría sigue como TEXT en `expenses` (snapshot del nombre).
-- Esta tabla es la "fuente de verdad" para el dropdown y para inferir el
-- valor por defecto de `is_pass_through` al crear un gasto.
-- Renombrar / desactivar / borrar una categoría NO afecta gastos históricos.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_pass_through_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to expense_categories"
  ON expense_categories FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_expense_categories_active_sort
  ON expense_categories(is_active, sort_order);

-- Seed con las categorías que estaban hardcoded en Finanzas.tsx.
-- "Rendición restaurante" se siembra con is_pass_through_default=true para
-- mantener el comportamiento actual.
INSERT INTO expense_categories (name, is_pass_through_default, sort_order) VALUES
  ('Insumos',                false, 10),
  ('Servicios',              false, 20),
  ('Alquiler',               false, 30),
  ('Sueldos',                false, 40),
  ('Impuestos',              false, 50),
  ('Rendición restaurante',  true,  60),
  ('Otros',                  false, 70)
ON CONFLICT (name) DO NOTHING;
