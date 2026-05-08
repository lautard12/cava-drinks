# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Production build
npm run lint      # ESLint
npm test          # Run tests once (vitest)
npm run test:watch  # Run tests in watch mode
```

Environment variables required: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (in `.env`).

## Architecture

This is a React + TypeScript + Vite app (bootstrapped via Lovable) for a bar/beverage business POS and management system. UI uses shadcn/ui components (Radix UI + Tailwind).

### Routing & Auth

- `src/App.tsx` — root router. All routes except `/login` are wrapped in `<ProtectedRoute>`.
- Three roles: `admin`, `cajero`, `cocina`. Role is fetched from `user_roles` Supabase table on login.
- `src/hooks/useAuth.tsx` — `AuthProvider` + `useAuth()` hook. Role-based redirects: cajero → `/caja`, cocina → `/cocina`, admin → `/stock`.

### Pages

| Route | Page | Access |
|---|---|---|
| `/stock` | Inventory/stock view | admin, cajero |
| `/products` | Product catalog management | admin |
| `/compras` | Purchase orders | admin |
| `/restaurant-menu` | Restaurant menu items | admin |
| `/ofertas` | Offers/combos | admin |
| `/caja` | POS terminal | all |
| `/cierre-del-dia` | Daily close/receipt | admin |
| `/finanzas` | Financial reports | admin |
| `/movimientos` | Stock movement history | admin |
| `/usuarios` | User management | admin |
| `/configuracion` | App configuration | admin |
| `/cocina` | Kitchen display | admin, cocina |

### Data Layer

All data access goes through Supabase. There are two parallel stores:

- **`src/lib/store.ts`** — legacy in-memory store using module-level globals + a `version` counter for React re-renders. Kept for reference/fallback.
- **`src/lib/supabase-store.ts`** — the active store with Supabase queries. New pages should use this.

Domain-specific stores in `src/lib/`:
- `pos-store.ts` — POS sales, cart items, payment processing, stock deduction
- `finanzas-store.ts` — financial reporting (revenue, COGS, expenses, fund movements)
- `cierre-store.ts` — daily close logic
- `movimientos-store.ts` — stock movement history
- `offer-store.ts` — offers/combos
- `price-store.ts` — product pricing (channel × term matrix: `RESTAURANTE_BASE`, `DELIVERY_BASE`, etc.)
- `restaurant-store.ts` — restaurant menu items and categories
- `tab-store.ts` — open tabs (comandas)
- `purchase-store.ts` — purchase orders
- `supplier-store.ts` — suppliers
- `config-store.ts` — app configuration
- `weekly-count-store.ts` — weekly inventory counts

### Key Domain Concepts

- **Products** have `type` (from `product_types` table), `category`, `variant_label`, `sku`, `track_stock`, `min_stock`, `cost_price`.
- **Stock** is tracked in `stock_balances` (one row per product) and `stock_movements` (ledger). Movement types: `PURCHASE`, `ADJUST`, `WASTE`, `SALE`.
- **POS sales** (`pos_sales`) have `channel` (`RESTAURANTE` | `DELIVERY`) and `price_term`. Items are stored in `pos_sale_items`. Payments in `pos_payments` with commission tracking.
- **Cart items** have `owner` (`LOCAL` | `RESTAURANTE`) — LOCAL items affect stock and COGS; RESTAURANTE items go to the restaurant tab.
- **Funds**: `EFECTIVO` (cash) and `MERCADOPAGO` (digital). Payment methods map to funds: EFECTIVO → EFECTIVO, everything else → MERCADOPAGO.
- **Offers** are combos with component products. When an offer is sold, stock is deducted per component.
- **Finance**: Bruto del local = `subtotal_local` (no incluye recargos cobrados al cliente). Profit = bruto − cogs − gastos. Las comisiones MP/tarjeta NO entran al PnL (ver "Business Rules" abajo).

### Component Organization

- `src/components/ui/` — shadcn/ui primitives (do not edit manually, regenerate via shadcn CLI)
- `src/components/pos/` — POS-specific components (checkout modal, open tabs, offers sheet)
- `src/components/stock/` — stock counting modes (daily count, weekly count, history)
- `src/components/config/` — configuration tabs (catalog, prices, offers, access)
- `src/components/restaurant/` — restaurant menu management
- `src/components/cierre/` — daily close receipt modal
- `src/components/product/` — product price/credit settings

### Supabase Integration

- Client: `src/integrations/supabase/client.ts` — uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Types: `src/integrations/supabase/types.ts` — auto-generated, do not edit.
- `@/` path alias maps to `src/`.

## Business Rules (importante)

Estas reglas son la fuente de verdad del negocio. Cualquier feature nueva en finanzas/POS debe respetarlas.

### Local vs Restaurante

- En una misma venta conviven items con `owner = 'LOCAL'` y `owner = 'RESTAURANTE'`.
- **El restaurante es pass-through:** `subtotal_restaurant` no entra al PnL del local. La plata entra físicamente a la caja pero queda como deuda con el dueño del restaurante.
- La rendición al dueño del restaurante se registra como `expense` con `is_pass_through = true` (categoría `RENDICION_CATEGORY`). Sale del fondo pero NO afecta resultado.
- "Pendiente de rendir restaurante" = Σ(`subtotal_restaurant + delivery_fee`) − Σ(rendiciones registradas), histórico hasta la fecha.

### Recargos MP/tarjeta

- Cuando el cliente paga con tarjeta/QR/transferencia, se le suma un recargo (configurable por término en `price_terms`).
- **Ese recargo lo paga el cliente, no el local.** Por eso:
  - `bruto del local = subtotal_local` (sin recargo) — el recargo no es ingreso tuyo.
  - La comisión del procesador NO se resta del PnL — no es gasto tuyo, es plata que nunca fue tuya.
  - MP se acredita NETO al fondo MERCADOPAGO (`amount − commission_amount`) — esto sí es lo que efectivamente entró.
- Fórmula de comisión por línea de pago: `commission = amount × pct / (100 + pct)` (extrae el recargo embebido en el bruto).

### Vista operacional vs analítica

- **Cierre del Día** (`/cierre-del-dia`): vista operacional, muestra **netos** (lo que efectivamente entró). Sin desglose de comisiones — ese dato vive en Finanzas.
- **Finanzas** (`/finanzas`): vista analítica, muestra todo el detalle incluyendo comisiones cobradas al cliente como línea informativa al pie del waterfall ("Cómo se forma tu ganancia").

### Términos de precio (`price_terms`)

- Fuente única de verdad para recargos. **No usar `surcharge_tiers`** (fue dropeada).
- Concepto **ancla**: el row con `sort_order = 0` Y `surcharge_pct = 0` es el precio base que el usuario carga manualmente. Los demás términos se derivan como `base × (1 + pct/100)`.
- Constraint en BD: solo un row puede tener `sort_order = 0`. La UI valida que ese row tenga `surcharge_pct = 0` y no se pueda borrar/desactivar.
- Configurable desde Configuración → Precios y Cobros (`PreciosTab.tsx`). El POS y CheckoutModal leen de esta tabla, no hay valores hardcodeados como `"BASE"`.

### Atomicidad de ventas

- `createSale` (delivery directa) y `closeTab` (cierre de cuenta abierta) **no deben** hacer SELECT/UPDATE separados sobre `stock_balances`.
- Toda la operación de venta pasa por RPCs de Postgres (`create_sale_atomic`, `close_tab_atomic`) que usan `SELECT ... FOR UPDATE` ordenado por `product_id` y transacción única.
- Los helpers `_lock_and_validate_stock`, `_apply_stock_deduction`, `_insert_payments` viven en el SQL y se reutilizan entre ambos RPCs.

### Arqueo de caja

- `cash_counts` registra lo contado físicamente al cierre, por (date, fund). UNIQUE en `(date, fund)`.
- `difference` es columna GENERATED (counted_amount − expected_amount).
- `expected_amount` se snapshotea al guardar el arqueo — si después cambian las ventas del día, el valor original queda para auditar.
- UI: `src/components/cierre/ArqueoCard.tsx`, integrada en Cierre del Día.

### Conteo semanal de inventario

- Flujo: el local cierra (típicamente domingos), el admin cuenta físicamente y carga `counted_qty` por producto. Si hay diferencia, debe seleccionar un motivo (`ROTURA`, `HURTO`, `ERROR_CARGA`, `VENCIMIENTO`, `OTRO`) + nota opcional. Al "Aplicar ajustes" el `qty_on_hand` queda igualado al conteo físico.
- **Premisa operacional:** el conteo se hace con el local cerrado. No hay ventas durante el conteo, por eso `system_qty` se snapshotea al crear el conteo y no se recalcula al aplicar.
- Tablas: `inventory_counts` (header, status `DRAFT` → `ADJUSTED` → `CLOSED`) e `inventory_count_lines` (una por producto activo con `track_stock=true`).
- `inventory_count_lines.diff_qty` es columna **GENERATED** (`counted_qty - system_qty`). Nunca escribirla manualmente — Postgres la rechaza.
- **Atomicidad:** `applyCountAdjustments` no hace SELECT/UPDATE separados. Todo pasa por `apply_inventory_count_atomic(p_count_id)`, que en una sola transacción: lockea el conteo (`FOR UPDATE`), valida `status = 'DRAFT'`, lockea `stock_balances` ordenado por `product_id`, inserta un `stock_movement` tipo `ADJUST` por cada diff != 0, upserta el balance, y marca el conteo como `ADJUSTED`. Mismo patrón que `create_sale_atomic`.
- **Idempotencia:** la validación de status en la RPC bloquea doble-aplicación. Un segundo intento falla con `EXCEPTION` y rollback completo — el ledger nunca queda con duplicados.
- **`save_inventory_count_draft(count_id, lines jsonb)`** reemplaza loops de N updates por un único `UPDATE ... FROM jsonb_array_elements`. Usar siempre esta RPC desde el cliente, no un loop de updates.
- **Un solo conteo activo:** unique partial index `inventory_counts_one_active` impide tener dos conteos simultáneos en `DRAFT`/`ADJUSTED`. La UI captura ese error y muestra mensaje específico.
- **Formato del `reason` en stock_movements:** `'Conteo {start}..{end} | {REASON_CODE}[: {note}]'`. El cliente (HistoryDrawer) parsea ese formato para mostrar badge legible. Si cambia el formato, actualizar `parseCountReason` en `src/components/stock/HistoryDrawer.tsx`.

### Cost snapshots

- `pos_sale_items.cost_snapshot` guarda el costo unitario **al momento de la venta**, no se recalcula.
- COGS de una línea = `cost_snapshot × qty`. Para ofertas, `cost_snapshot` es la suma de costos de los componentes que forman una unidad de la oferta.
- Si un componente de oferta no tiene `cost_price` cargado, el COGS de esa oferta queda subestimado (no hay alerta automática).
