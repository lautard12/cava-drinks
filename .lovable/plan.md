

## Plan: Implementar módulo de Compras de Mercadería

### Situación actual
- La tabla `stock_purchases` ya existe (cabecera) pero falta `stock_purchase_items` (detalle) y `suppliers` (proveedores).
- `purchase-store.ts` solo tiene `fetchPurchasesTotalByFund`. Hay que expandirlo con todo el CRUD.
- No existe la página `/compras` ni la navegación hacia ella.
- `stock_movements` ya tiene `sale_id` pero no `supplier_id` — hay que agregarlo.
- Finanzas ya importa `fetchPurchasesTotalByFund` desde `purchase-store.ts` — esa conexión se mantiene.

### Fase 1: Migración de base de datos

Una migración SQL que:

1. **Crea tabla `suppliers`**: `id`, `name`, `phone`, `lead_time_days`, `created_at`. RLS abierta.
2. **Crea tabla `stock_purchase_items`**: `id`, `purchase_id` (FK → stock_purchases), `product_id` (FK → products), `qty`, `unit_cost`, `line_total`, `created_at`. RLS abierta.
3. **Agrega `supplier_id`** (nullable, FK → suppliers) a `stock_purchases`.
4. **Agrega `supplier_id`** (nullable, FK → suppliers) a `stock_movements`.
5. **Trigger `validate_payment_method_fund`** en `stock_purchases` para validar que `payment_fund` sea EFECTIVO o MERCADOPAGO.

### Fase 2: Stores

**`src/lib/purchase-store.ts`** — Reescribir completo con:
- Interfaces: `StockPurchase`, `StockPurchaseItem`, `PurchaseItemInput`
- `fetchPurchases(from?, to?)` — listar compras
- `fetchPurchaseWithItems(purchaseId)` — detalle con ítems + join products
- `createPurchase(params)` — operación multi-paso: cabecera → ítems → stock_movements (PURCHASE) → stock_balances (upsert) → opcionalmente actualizar `products.cost_price`
- `fetchPurchasesTotalByFund(from?, to?)` — se mantiene para Finanzas

**`src/lib/supplier-store.ts`** — Nuevo:
- `fetchSuppliers()`, `createSupplier()`, `updateSupplier()`, `deleteSupplier()`

### Fase 3: Página `/compras`

**`src/pages/Compras.tsx`** — Nueva página con:
- **Header**: título + botón "Nueva compra"
- **KPI cards**: Total compras ($) y cantidad de compras
- **Filtros de fecha**: Hoy / 7 días / Mes / Custom (mismos presets que Finanzas)
- **Tabla**: Fecha, Proveedor, Fondo, Método pago, Total, Acciones (ver detalle)
- **Dialog "Nueva compra"**:
  - Fecha (default hoy), Fondo (EFECTIVO/MERCADOPAGO), Proveedor (select + opción "Sin proveedor"), Notas
  - Lista dinámica de productos: selector de producto + qty + costo unitario (pre-llenado con `cost_price`) + subtotal calculado
  - Botón agregar línea / eliminar línea
  - Checkbox "Actualizar costo de productos"
  - Total automático
- **Dialog detalle**: muestra los ítems de una compra existente
- Invalidación de queries: `stock-purchases`, `products-with-stock`, `finanzas-capital`, `movements`

### Fase 4: Routing y navegación

**`src/App.tsx`**: Agregar ruta `/compras` protegida para admin.

**`src/components/AppSidebar.tsx`**: Agregar "Compras" en el grupo "Inventario" con icono `Truck` (lucide), solo para admin.

### Fase 5: Conexión con Stock

Reemplazar el botón "Compra" actual en Stock.tsx (que usa `StockActionModal` con un simple movimiento) para que ahora redireccione a `/compras` o mantenga la funcionalidad simplificada existente — la compra formal con detalle de ítems y proveedor se hace desde `/compras`.

### Archivos

| Archivo | Acción |
|---------|--------|
| Migración SQL | Crear (suppliers, stock_purchase_items, FKs, trigger) |
| `src/lib/purchase-store.ts` | Reescribir completo |
| `src/lib/supplier-store.ts` | Crear nuevo |
| `src/pages/Compras.tsx` | Crear nuevo |
| `src/App.tsx` | Agregar ruta `/compras` |
| `src/components/AppSidebar.tsx` | Agregar link "Compras" |

### No se toca
- `finanzas-store.ts` (ya importa `fetchPurchasesTotalByFund` correctamente)
- Stock, POS, Cocina, Movimientos, Ofertas

