# Scripts

Scripts utilitarios que NO forman parte de la app. Se corren manualmente desde tu compu.

---

## `import-initial-data.ts` — Importación inicial desde Excel

Carga el catálogo de productos del cliente (con stock inicial y precios de venta) en una sola corrida. Pensado para usar **una sola vez** al onboardear al cliente.

### Qué hace

Por cada fila del Excel:

1. **Crea o actualiza el producto** en `products` (matchea por `sku`).
2. **Si tiene `stock_inicial > 0`**, inserta un movimiento `ADJUST` en `stock_movements` con razón "Carga inicial desde Excel" y actualiza `stock_balances`.
3. **Si tiene `precio_restaurante`** y/o **`precio_delivery`**, los carga en `product_prices` como precio ancla del canal correspondiente. Los precios derivados (débito, crédito) los calcula la app automáticamente con los recargos de `price_terms`.

**Es idempotente**: lo podés correr varias veces. Los productos se actualizan por SKU. Los movimientos de stock NO se duplican (se skipea si ya existe una carga inicial para ese producto). Los precios se actualizan in-place.

### Lo que NO hace (a propósito)

- No carga combos/ofertas. Cargalos desde `/ofertas` después.
- No carga `cost_price`. El cliente lo completa producto por producto en la app.
- No crea `product_types` ni `product_categories` ni `price_terms`. Esos hay que tenerlos creados antes desde `/configuracion`.

---

## Setup (primera vez)

### 1. Conseguir la `service_role key` de Supabase

1. Andá a https://supabase.com/dashboard
2. Abrí el proyecto de **cava-drinks**.
3. En el menú izquierdo: **Settings** (engranaje) → **API**.
4. Bajá hasta **Project API keys**.
5. Buscá la key `service_role` (`secret`) y clickeá **Reveal**.
6. Copiá el valor.

> ⚠️ **IMPORTANTE**: la `service_role key` se saltea TODAS las reglas de seguridad de la base. NO la pegues nunca en el `.env` del front, no la subas a GitHub, no la compartas por chat. Si se filtra, regenerala desde el mismo panel.

### 2. Configurar el `.env.scripts`

```powershell
# Desde la raíz del proyecto, en PowerShell:
Copy-Item scripts\.env.scripts.example scripts\.env.scripts
```

Abrí `scripts/.env.scripts` y pegá los valores reales:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

El `SUPABASE_URL` es el mismo que ya está en `.env` como `VITE_SUPABASE_URL`.

> El archivo `.env.scripts` está en `.gitignore`, no se va a subir al repo.

---

## Armar el Excel

Guardá el archivo en `scripts/data/inventario-inicial.xlsx`.

Una sola hoja llamada **`productos`** con estas columnas (en este orden, encabezados en la fila 1):

| Columna | Obligatoria | Tipo | Descripción |
|---|---|---|---|
| `sku` | sí | texto | Código del cliente (A001, A013, V001…). Único. |
| `name` | sí | texto | Nombre del producto. |
| `type` | sí | texto | Debe coincidir con un tipo activo en `product_types` (ej: `Vino`, `Gaseosa`). |
| `category` | sí | texto | Categoría libre (ej: `Vinos Tintos`, `Gaseosas`, `Aguas`). |
| `variant_label` | no | texto | Variante corta (ej: `2.25L`, `750ml`). Vacío si no aplica. |
| `min_stock` | no | número | Stock mínimo. Default: `0`. |
| `track_stock` | no | TRUE/FALSE | Si se controla stock. Default: `TRUE`. |
| `stock_inicial` | no | número | Cantidad física actual. `0` o vacío = no se carga movimiento. |
| `precio_restaurante` | no | número | Precio "para comer acá". Vacío = no se carga. |
| `precio_delivery` | no | número | Precio "efec y trans Delivery". Vacío = no se carga. |

### Ejemplo

```
sku   | name                    | type    | category     | variant_label | min_stock | track_stock | stock_inicial | precio_restaurante | precio_delivery
A001  | Coca 2,25lts            | Gaseosa | Gaseosas     | 2.25L         | 0         | TRUE        | 11            | 3500               | 3000
A013  | Agua S/Gas 2,25LTS      | Agua    | Aguas        | 2.25L         | 0         | TRUE        | 4             | 2500               | 2000
V001  | Saint Felicien Malbec   | Vino    | Vinos Tintos | 750ml         | 0         | TRUE        | 0             | 13500              | 11000
```

### Antes de correr el script, verificá:

1. **Tipos de producto** — todos los valores que uses en la columna `type` tienen que existir y estar activos en `/configuracion` → Catálogo. Si falta alguno, el script lo lista y aborta.
2. **Término ancla de precios** — debe existir un row en `price_terms` con `sort_order = 0` y `surcharge_pct = 0` (es el precio base sin recargo). Si no existe, configuralo en `/configuracion` → Precios y Cobros.

---

## Correr el script

### Paso 1 — Dry-run (validación sin escribir)

```powershell
npm run import:dry
```

Va a leer el Excel, validar formato, verificar tipos contra Supabase y mostrar un resumen:

```
📊 Resumen:
   Productos a procesar: 87
   Movimientos de stock a generar: 65
   Precios RESTAURANTE a cargar: 90
   Precios DELIVERY a cargar: 90
```

Si algo falla, lo reporta y aborta sin tocar nada.

### Paso 2 — Importación real

Si el dry-run está OK:

```powershell
npm run import:run
```

Procesa todas las filas y al final muestra cuántas se importaron OK y cuáles fallaron.

### Paso 3 — Verificar en la app

1. Abrir `/products` → ver el listado, los SKUs deben aparecer.
2. Abrir un producto → ver que tenga los precios de RESTAURANTE y DELIVERY, y que los precios derivados (débito, crédito) se calculen automáticamente con el recargo.
3. Abrir `/stock` → verificar que las cantidades coincidan con el Excel.
4. Abrir `/movimientos` → ver una entrada `ADJUST` por producto con razón "Carga inicial desde Excel".

### Paso 4 — Cleanup

Una vez verificada la importación:

```powershell
Remove-Item scripts\.env.scripts
```

La service_role key no debería quedar dando vueltas en disco.

---

## Troubleshooting

**"No existe scripts/.env.scripts"** — copiá el `.example` y pegá las credenciales.

**"SUPABASE_SERVICE_ROLE_KEY no está configurado"** — todavía tiene el placeholder, pegá la key real.

**"Faltan tipos de producto en /configuracion"** — el script lista los nombres faltantes. Creá esos tipos desde `/configuracion` → Catálogo y volvé a correr.

**"No se encontró un término ancla"** — andá a `/configuracion` → Precios y Cobros y configurá el término base (sort_order=0, recargo 0%).

**"sku duplicado en el Excel"** — hay dos filas con el mismo SKU. Corregí el Excel.

**Errores parciales en la corrida real** — el script reporta qué filas fallaron. Corregí el Excel y volvé a correr `npm run import:run`. Es idempotente, no duplica.
