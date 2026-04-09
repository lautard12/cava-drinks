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
- **Finance**: Revenue = bruto − comisiones (commission). Profit = neto − cogs − gastos.

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
