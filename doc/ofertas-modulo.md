# Módulo OFERTAS — Documentación Funcional y Técnica

> **Versión**: 3.0  
> **Fecha**: 2026-03-24  
> **Estado**: Diseño — pendiente de implementación  
> **Sistema**: CavaDrinks POS  
> **Cambio principal v3**: Las ofertas aplican **exclusivamente a productos LOCAL** y **SÍ pueden usarse en tabs/cuentas abiertas** (solo para productos LOCAL). No aplican a COMIDA/RESTAURANTE.

---

## Índice

- [A. Resumen ejecutivo](#a-resumen-ejecutivo)
- [B. Alcance funcional del MVP](#b-alcance-funcional-del-mvp)
- [C. Casos de uso](#c-casos-de-uso)
- [D. Diseño funcional UX/UI](#d-diseño-funcional-uxui)
- [E. Modelo de datos propuesto](#e-modelo-de-datos-propuesto)
- [F. Diseño transaccional y de consistencia](#f-diseño-transaccional-y-de-consistencia)
- [G. Reglas de negocio detalladas](#g-reglas-de-negocio-detalladas)
- [H. Impacto sobre reportes y márgenes](#h-impacto-sobre-reportes-y-márgenes)
- [I. Riesgos y puntos delicados](#i-riesgos-y-puntos-delicados)
- [J. Recomendación final de arquitectura](#j-recomendación-final-de-arquitectura)

---

## A. Resumen ejecutivo

### Objetivo del módulo

El módulo OFERTAS permite al administrador crear promociones comerciales (combos, 2x1, packs por cantidad) **exclusivamente sobre productos LOCAL** que el cajero aplica manualmente desde la pantalla de CAJA. El objetivo es aumentar el ticket promedio y ofrecer promociones atractivas sin perder trazabilidad de stock ni precisión financiera.

### Restricción fundamental: SOLO productos LOCAL

Las ofertas trabajan **únicamente** con registros de la tabla `products` (owner = LOCAL). Esto significa:

- **NO** incluyen `restaurant_items` (comida/restaurante).
- **NO** afectan cocina ni el flujo de kitchen.
- **NO** generan envíos a cocina.
- **NO** impactan `subtotal_restaurant`.
- **SOLO** impactan `subtotal_local` y `total`.
- **SOLO** descuentan stock de `products` + `stock_balances`.
- **SOLO** generan movimientos `SALE` en `stock_movements` para productos LOCAL.

Esta decisión simplifica significativamente la arquitectura porque:
- Elimina la necesidad del owner `MIXED`.
- Elimina la complejidad del prorrateo entre `subtotal_local` y `subtotal_restaurant`.
- Elimina la interacción con el flujo de cocina.
- Elimina la posibilidad de combos mixtos LOCAL + RESTAURANTE.

### Por qué una oferta NO es un producto con stock

| Criterio | Producto con stock propio | Regla comercial (recomendado) |
|---|---|---|
| Stock | Requiere stock propio, duplica gestión | Descuenta de productos reales |
| Trazabilidad | Se pierde qué productos reales se consumieron | Se mantiene componente por componente |
| Consistencia | Puede desincronizar stock real vs oferta | Stock siempre refleja realidad |
| Flexibilidad | Cambiar componentes requiere nuevo producto | Se edita la regla, los productos reales no cambian |
| COGS | Costo artificial asignado al "producto oferta" | Costo real calculado desde componentes |
| Reportes | Oculta qué productos se vendieron realmente | Permite análisis de demanda real por producto |

**Decisión**: una oferta es una **regla comercial** que agrupa productos LOCAL existentes bajo un precio promocional. No tiene stock propio. El stock se descuenta siempre de los productos reales que la componen.

### Integración con módulos existentes

```
┌─────────────────────────────────────────────────┐
│                   ADMINISTRACIÓN                │
│  Crear / Editar / Activar / Desactivar ofertas  │
│  offers + offer_items (solo products LOCAL)      │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│                     CAJA                        │
│  Botón "Ofertas" (solo en pestaña Productos)    │
│  NO disponible en pestaña Comida                │
│  Línea tipo OFFER en pos_sale_items             │
│  owner = 'LOCAL' siempre                        │
│  Desglose visible de componentes                │
│  Validación de stock en tiempo real             │
└──────────────────────┬──────────────────────────┘
                       │ Al cobrar (COMPLETED)
                       ▼
┌──────────────┐  ┌──────────────────────────────┐
│    STOCK     │  │        MOVIMIENTOS            │
│ Descuento    │  │ Un movimiento SALE por cada   │
│ por producto │  │ producto componente LOCAL      │
│ LOCAL real   │  │ con referencia a la venta      │
└──────────────┘  └──────────────────────────────┘
```

---

## B. Alcance funcional del MVP

### Qué entra en el MVP

#### Tipo 1: Oferta de mismo producto por cantidad

El usuario define una oferta que aplica a un único producto LOCAL con una cantidad fija y un precio promocional.

**Ejemplos:**
- "2 Coca 500ml por $3.000"
- "3 Quilmes Lata por $4.500"
- "2x1 en Agua Mineral" (precio = precio de 1 unidad)

**Características:**
- Un solo producto LOCAL como componente
- Cantidad fija ≥ 2
- Precio promocional fijo definido por el admin
- Al venderse, descuenta N unidades del producto real LOCAL

#### Tipo 2: Combo fijo de varios productos LOCAL

El usuario define una oferta que combina varios productos LOCAL diferentes, cada uno con su cantidad, bajo un precio único.

**Ejemplos:**
- "Fernet + Coca por $8.000"
- "2 Cervezas + 1 Snack por $5.000"
- "3 Quilmes + Maní por $6.500"

**Características:**
- Múltiples productos LOCAL como componentes (2 o más líneas)
- Cada componente tiene cantidad fija
- **Todos los componentes son exclusivamente de tipo `product` (LOCAL)**
- **NO se permite incluir `restaurant_items`**
- Precio promocional fijo definido por el admin
- Al venderse, descuenta stock de cada producto componente LOCAL individualmente

### Qué NO entra en el MVP

| Funcionalidad excluida | Razón |
|---|---|
| Ofertas con productos RESTAURANTE / comida | Decisión de diseño: ofertas solo LOCAL |
| Combos mixtos (LOCAL + RESTAURANTE) | No aplica por restricción de scope |
| Ofertas automáticas | Complejidad de motor de reglas; el cajero aplica manualmente |
| Ofertas por categoría abierta ("cualquier bebida") | Requiere selector dinámico en caja; fuera de alcance |
| Promociones apilables | Una línea = una oferta; no se combinan |
| Promociones por cliente | No existe módulo de clientes |
| Promociones por medio de pago | Complejidad transaccional; puede agregarse después |
| Promociones por horario | Requiere scheduler; fuera de alcance |
| Descuento porcentual sobre línea | MVP usa precio fijo; descuento % es evolución futura |
| Motor complejo de promociones | Se busca simplicidad operativa |

### Supuestos

1. El administrador crea las ofertas desde una pantalla dedicada dentro del sistema.
2. El cajero tiene visibilidad de las ofertas activas desde CAJA, **únicamente en la pestaña de Productos (LOCAL)**.
3. Una oferta solo se puede aplicar si todos sus componentes tienen stock suficiente (para los que tienen `track_stock = true`).
4. El precio de la oferta es fijo e independiente de los precios individuales de los componentes.
5. Las ofertas se aplican al precio base; los recargos por término de pago (débito, crédito) se calculan sobre el precio de la oferta.
6. **Todos los componentes de una oferta son productos LOCAL** (tabla `products`), nunca `restaurant_items`.

### Restricciones

1. No se modifica la estructura fundamental de `pos_sales` ni `pos_payments`.
2. Se extiende `pos_sale_items` con campos opcionales para vincular ofertas.
3. Se crea una tabla auxiliar para desglose de componentes reales (solo productos LOCAL).
4. Los movimientos de stock siguen siendo por producto individual LOCAL.
5. No se crea un nuevo tipo de movimiento; se usa `SALE` existente.
6. **Las ofertas NUNCA referencian `restaurant_items`**.
7. **El owner de una línea OFFER siempre es `'LOCAL'`**.

---

## C. Casos de uso

### CU-01: Crear oferta

**Actor**: Administrador  
**Precondición**: Usuario autenticado con rol `admin`  
**Flujo principal**:

1. Admin navega a la pantalla de Ofertas (nuevo menú lateral).
2. Presiona "Nueva Oferta".
3. Se abre formulario con:
   - Nombre de la oferta (texto, obligatorio)
   - Tipo: "Cantidad" o "Combo" (selector)
   - Si tipo = "Cantidad":
     - Selector de producto (**solo productos LOCAL activos**)
     - Cantidad (número entero ≥ 2)
   - Si tipo = "Combo":
     - Lista de componentes (agregar líneas):
       - Selector de producto (**solo productos LOCAL activos**)
       - Cantidad por componente (entero ≥ 1)
     - Mínimo 2 componentes
   - Precio promocional (número entero > 0, en pesos)
   - Estado: Activa / Inactiva (toggle, default activa)
4. Al guardar:
   - Se valida que todos los campos obligatorios estén completos.
   - **Se valida que todos los componentes sean productos LOCAL (tabla `products`). Si se intenta incluir un `restaurant_item`, el sistema lo bloquea.**
   - Se valida que el precio promocional sea menor que la suma de precios individuales (warning, no bloqueo).
   - Se inserta en `offers` + `offer_items`.
5. Se muestra toast de confirmación y se vuelve al listado.

**Flujo alternativo**:
- Si el nombre ya existe → mostrar error "Ya existe una oferta con ese nombre".
- Si no se selecciona ningún componente → deshabilitar botón guardar.

---

### CU-02: Editar oferta

**Actor**: Administrador  
**Precondición**: Oferta existente  
**Flujo principal**:

1. Admin selecciona una oferta del listado.
2. Se abre el formulario con datos precargados.
3. Puede modificar: nombre, componentes, cantidades, precio, estado.
4. No puede cambiar el tipo (Cantidad ↔ Combo) una vez creada.
5. **El selector de productos solo muestra productos LOCAL activos.**
6. Al guardar se actualizan `offers` y se reemplazan `offer_items` (delete + insert).

**Nota**: Editar una oferta no afecta ventas ya cerradas, porque `pos_sale_items` guarda snapshots.

---

### CU-03: Activar / Desactivar oferta

**Actor**: Administrador  
**Flujo**:

1. En el listado, cada oferta tiene un toggle de estado.
2. Al desactivar, la oferta deja de aparecer en CAJA.
3. Si la oferta estaba en un carrito en memoria (DELIVERY), se pierde al recargar la página (no hay persistencia de carrito DELIVERY).
4. Si la oferta estaba en una tab/cuenta abierta, la línea persiste pero al intentar cobrar se valida que la oferta siga activa. Si fue desactivada → bloqueo del cobro con toast explicativo.

---

### CU-04: Listar ofertas

**Actor**: Administrador  
**Flujo**:

1. Pantalla con tabla/cards de todas las ofertas.
2. Columnas: Nombre | Tipo | Componentes (resumen) | Precio | Estado | Acciones.
3. Filtros: por estado (Activas / Inactivas / Todas), por tipo (Cantidad / Combo).
4. Buscador por nombre.
5. Orden por nombre o por fecha de creación.

---

### CU-05: Ver ofertas disponibles en CAJA

**Actor**: Cajero  
**Precondición**: Pantalla de CAJA abierta  
**Flujo principal**:

1. En la barra de acciones de CAJA existe el botón **"Ofertas"** con ícono de tag/etiqueta.
2. **El botón "Ofertas" solo está activo/visible cuando la pestaña "Productos" (LOCAL) está seleccionada.**
3. **Si el cajero está en la pestaña "Comida" (RESTAURANTE), el botón NO aparece o está deshabilitado.**
4. Al presionar, se abre un **Sheet** (panel lateral) con:
   - Lista de ofertas activas.
   - Cada oferta muestra: nombre, precio, desglose resumido de componentes (todos LOCAL).
   - Indicador visual de disponibilidad de stock (verde = disponible, rojo = sin stock).
5. Las ofertas sin stock suficiente aparecen deshabilitadas con texto explicativo.

---

### CU-06: Aplicar oferta al carrito

**Actor**: Cajero  
**Precondición**: Oferta activa con stock disponible  
**Flujo principal**:

1. Cajero toca una oferta disponible en el sheet.
2. Se agrega al carrito como una línea especial con:
   - Nombre de la oferta como label principal.
   - Precio de la oferta como `unit_price`.
   - Cantidad = 1 (se puede incrementar con +/−).
   - **Owner = `'LOCAL'` siempre.**
   - Indicador visual tipo badge "OFERTA" para diferenciarla.
   - Desglose expandible mostrando los componentes reales LOCAL y sus cantidades.
3. Se cierra el sheet automáticamente.
4. El stock requerido se valida pero NO se descuenta aún (solo al cobrar).

**Flujo alternativo**:
- Si durante el proceso de agregar se detecta que ya no hay stock → toast de error, no se agrega.

---

### CU-07: Repetir oferta en el ticket

**Actor**: Cajero  
**Flujo**:

1. Si la oferta ya está en el carrito, el cajero puede:
   - Presionar "+" en la línea de oferta para incrementar cantidad.
   - O volver a abrir "Ofertas" y seleccionar la misma nuevamente (incrementa cantidad).
2. La validación de stock se hace por la cantidad total: si la oferta requiere 2 Cocas y el cajero pide qty=3, se validan 6 Cocas en stock.

---

### CU-08: Validar stock de oferta

**Actor**: Sistema (automático)  
**Trigger**: Al agregar oferta al carrito y al confirmar cobro  
**Flujo**:

1. Para cada componente de la oferta:
   - Si el componente tiene `track_stock = true`:
     - Calcular stock requerido = `qty_componente × qty_oferta_en_carrito`
     - Sumar stock ya comprometido por otras líneas del mismo producto en el carrito (tanto líneas normales como de otras ofertas)
     - Verificar que `stock_disponible ≥ stock_total_requerido`
   - Si `track_stock = false`: no validar stock.
2. Si algún componente no tiene stock suficiente → bloquear la acción con mensaje claro indicando qué producto falta.

**Nota**: Todos los componentes son productos LOCAL, por lo que todos tienen `track_stock` definido y `cost_price` disponible.

---

### CU-09: Cobrar venta con oferta

**Actor**: Cajero  
**Precondición**: Carrito con al menos una línea de oferta  
**Flujo principal**:

1. Cajero presiona "Cobrar".
2. Se abre `CheckoutModal` normalmente.
3. El total incluye la oferta al precio promocional (no la suma de componentes).
4. Los recargos por término de pago se aplican sobre el precio de la oferta.
5. Al confirmar pago:
   - **Para DELIVERY** (`createSale`):
     a. Se valida stock de todos los componentes de todas las ofertas.
     b. Se inserta `pos_sales` con status `COMPLETED`.
     c. Se inserta una línea en `pos_sale_items` por cada oferta con `item_type = 'OFFER'`, `owner = 'LOCAL'`.
     d. Se insertan registros en `pos_sale_item_components` para cada componente real LOCAL.
     e. Se insertan pagos en `pos_payments`.
     f. Se descuenta stock por cada componente con `track_stock = true`.
     g. Se crean movimientos `SALE` en `stock_movements` por cada componente LOCAL.
   - **Para tabs/cuentas abiertas** (`closeTab`):
     a. Se revalida stock de todos los componentes de todas las ofertas en la cuenta.
     b. Se revalida que las ofertas sigan activas.
     c. Se insertan registros en `pos_sale_item_components` para cada componente real LOCAL (los items OFFER ya están persistidos en `pos_sale_items` desde que se agregaron a la tab).
     d. Se insertan pagos en `pos_payments`.
     e. Se descuenta stock por cada componente con `track_stock = true`.
     f. Se crean movimientos `SALE` en `stock_movements` por cada componente LOCAL.
     g. Se marca la venta como `COMPLETED`.
     h. **Las ofertas NO se envían a cocina** (son productos LOCAL, no comida).

**Nota**: Las ofertas siempre suman a `subtotal_local`, nunca a `subtotal_restaurant`.
**Nota**: El stock NO se descuenta al agregar la oferta a la tab. Solo se descuenta al cerrar/cobrar.

---

### CU-10: Registrar movimientos de stock

**Actor**: Sistema (automático al cobrar)  
**Flujo**:

1. Por cada línea de oferta en la venta:
   - Por cada componente de esa oferta:
     - Si `track_stock = true`:
       - Crear movimiento en `stock_movements`:
         - `product_id`: ID del producto componente LOCAL
         - `type`: "SALE"
         - `qty`: cantidad_componente × cantidad_oferta
         - `reason`: "Venta POS — Oferta: {nombre_oferta}"
         - `sale_id`: ID de la venta (campo nuevo)
         - `created_by`: cashier_id
       - Actualizar `stock_balances.qty_on_hand` restando la cantidad.

---

### CU-11: Imprimir ticket con oferta

**Actor**: Sistema  
**Flujo**:

1. En el ticket / recibo, la línea de oferta se muestra como:
   ```
   OFERTA: 2 Coca 500ml por $3.000
     • Coca Cola 500ml ×2
                         $3.000
   ─────────────────────────────────
   OFERTA: Fernet + Coca
     • Fernet 750ml ×1
     • Coca Cola 1.5L ×1
                         $8.000
   ─────────────────────────────────
   ```
2. El nombre de la oferta es visible y claro.
3. El desglose de componentes aparece indentado debajo.
4. El precio de la línea es el precio promocional, no la suma de componentes.

---

### CU-12: Comportamiento en DELIVERY

**Flujo**:

1. En modo DELIVERY (carrito en memoria):
   - Las ofertas se agregan al carrito local igual que productos normales.
   - La línea de oferta vive en el estado del carrito como `CartItem` con `item_type = 'OFFER'`, `owner = 'LOCAL'`.
   - Al confirmar venta (`createSale`), se persisten todas las líneas y componentes.
2. El `delivery_fee` se aplica sobre el total de la venta, incluyendo ofertas.

---

### CU-13: Comportamiento en tabs/cuentas abiertas

**Regla**: Las ofertas **SÍ aplican en tabs/cuentas abiertas**, pero **SOLO para productos LOCAL**. Las ofertas nunca incluyen comida/RESTAURANTE.

**Flujo principal**:

1. El cajero tiene una tab abierta y está operando en la pestaña "Productos" (LOCAL).
2. El botón "Ofertas" está disponible y activo.
3. Al seleccionar una oferta:
   a. Se valida stock de los componentes en tiempo real.
   b. Se persiste la línea de oferta en `pos_sale_items` con:
      - `item_type = 'OFFER'`
      - `owner = 'LOCAL'`
      - `offer_id`, `offer_name_snapshot`, `offer_price_snapshot`
      - `sent_to_kitchen = false` (las ofertas nunca van a cocina)
   c. Se recalculan los totales de la tab (`subtotal_local` se incrementa, `subtotal_restaurant` no se toca).
   d. **NO se descuenta stock** en este momento.
   e. **NO se crean movimientos** en este momento.
4. La oferta persiste en la tab como cualquier otro item.
5. El cajero puede ver el desglose de componentes en la tab, con badge "OFERTA".
6. Al cerrar/cobrar la tab (`closeTab`):
   a. Se revalida stock de todos los componentes de todas las ofertas.
   b. Se revalida que las ofertas sigan activas.
   c. Si falta stock o la oferta fue desactivada → bloqueo del cobro con toast explicativo.
   d. Si todo válido: se insertan `pos_sale_item_components`, se descuenta stock, se crean movimientos SALE, se marca COMPLETED.

**Reglas de stock en tabs**:
- **Al agregar**: validación de stock (warning si no alcanza, no se agrega).
- **Al cerrar**: revalidación de stock (bloqueo si no alcanza).
- **No hay reserva de stock**: entre agregar y cerrar, otro cajero puede vender el mismo producto y agotar stock. Esto se mitiga con la revalidación al cierre.
- Los movimientos `SALE` se crean **solo al cierre**, nunca antes.

**Interacción con pestaña Comida**:
- Si el cajero cambia a la pestaña "Comida", el botón "Ofertas" se oculta/desactiva.
- Los items de comida (RESTAURANTE) en la misma tab no se ven afectados por las ofertas.
- Las ofertas conviven con items RESTAURANTE en la misma tab, pero son independientes.

---

## D. Diseño funcional UX/UI

### D.1 Administración de Ofertas

#### Pantalla de listado

**Ubicación**: Nuevo ítem en el menú lateral: "Ofertas" (ícono: Tag), visible solo para rol `admin`.

**Layout**:
```
┌──────────────────────────────────────────────────────┐
│  Ofertas                              [+ Nueva Oferta] │
├──────────────────────────────────────────────────────┤
│  🔍 Buscar...    [Todas ▾]  [Tipo ▾]                │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐  │
│  │ 🏷️ 2 Coca 500ml por $3.000                    │  │
│  │    Tipo: Cantidad │ Componentes: Coca 500ml ×2 │  │
│  │    Precio: $3.000 │ 🟢 Activa    [Editar] [⚙]  │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 🏷️ Fernet + Coca                              │  │
│  │    Tipo: Combo │ Fernet 750ml ×1, Coca 1.5L ×1│  │
│  │    Precio: $8.000 │ 🟢 Activa    [Editar] [⚙]  │  │
│  ├────────────────────────────────────────────────┤  │
│  │ 🏷️ 3 Quilmes Lata                             │  │
│  │    Tipo: Cantidad │ Quilmes Lata ×3            │  │
│  │    Precio: $4.500 │ 🔴 Inactiva  [Editar] [⚙]  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Filtros**:
- Estado: Todas / Activas / Inactivas
- Tipo: Todos / Cantidad / Combo

**Acciones por oferta**:
- Editar (abre formulario)
- Toggle activa/inactiva
- Eliminar (con confirmación; solo si no tiene ventas asociadas)

#### Formulario de alta/edición

**Layout del formulario**:

```
┌──────────────────────────────────────────────────────┐
│  Nueva Oferta                                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Nombre de la oferta *                               │
│  ┌────────────────────────────────────────────────┐  │
│  │ 2 Coca 500ml por $3.000                        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Tipo de oferta *                                    │
│  ┌──────────────┐ ┌──────────────┐                   │
│  │ ● Cantidad   │ │ ○ Combo      │                   │
│  └──────────────┘ └──────────────┘                   │
│                                                      │
│  ── Componentes (solo productos LOCAL) ───────────   │
│                                                      │
│  [Si tipo = Cantidad]                                │
│  Producto LOCAL *       Cantidad *                   │
│  ┌──────────────────┐   ┌────┐                       │
│  │ 🔍 Coca 500ml    │   │ 2  │                       │
│  └──────────────────┘   └────┘                       │
│                                                      │
│  [Si tipo = Combo]                                   │
│  Producto LOCAL          Cantidad    Acciones         │
│  ┌──────────────────┐    ┌────┐     ┌───┐            │
│  │ Fernet 750ml     │    │ 1  │     │ 🗑│            │
│  ├──────────────────┤    ├────┤     ├───┤            │
│  │ Coca Cola 1.5L   │    │ 1  │     │ 🗑│            │
│  └──────────────────┘    └────┘     └───┘            │
│  [+ Agregar componente]                              │
│                                                      │
│  ── Precio ───────────────────────────────────────   │
│                                                      │
│  Precio promocional *     Precio ref. individual     │
│  ┌────────────┐           $10.000                    │
│  │ $8.000     │           (Ahorro: $2.000)           │
│  └────────────┘                                      │
│                                                      │
│  Estado                                              │
│  [🟢 Activa ────────○]                               │
│                                                      │
│  ┌──────────┐  ┌──────────┐                          │
│  │ Cancelar │  │  Guardar │                          │
│  └──────────┘  └──────────┘                          │
└──────────────────────────────────────────────────────┘
```

**Selector de producto**: Componente de búsqueda (combobox/command) que busca **exclusivamente** en:
- `products` activos (muestra nombre + variant_label + categoría)
- **NO incluye `restaurant_items`**

**Si un admin intenta incluir algo de COMIDA/RESTAURANTE, el sistema lo bloquea porque el selector solo muestra productos LOCAL.**

**Precio referencia individual**: Se calcula automáticamente como la suma de `precio_base × cantidad` de cada componente LOCAL. Sirve como referencia para que el admin vea cuánto "ahorro" genera la oferta.

**Validaciones del formulario**:
- Nombre: obligatorio, mínimo 3 caracteres
- Componentes: al menos 1 (tipo Cantidad) o 2 (tipo Combo)
- Cantidad por componente: entero ≥ 1 (≥ 2 para tipo Cantidad)
- Precio promocional: entero > 0
- Warning (no bloqueante) si precio ≥ precio referencia individual
- **Todos los componentes deben ser productos LOCAL (validación implícita por el selector)**

---

### D.2 Integración en CAJA

#### Ubicación del botón "Ofertas"

El botón se ubica en la **barra de acciones** de CAJA.

**Regla de visibilidad**:
- **Visible/activo**: cuando la pestaña "Productos" (LOCAL) está seleccionada, tanto en modo DELIVERY como en una tab/cuenta abierta.
- **Oculto/deshabilitado**: cuando la pestaña "Comida" (RESTAURANTE) está seleccionada.

**Desktop**:
```
┌─────────────────────────────────────────────────────────┐
│  Canal: [DELIVERY ▾]   Precio: [Efectivo] [Débito]      │
│                                                         │
│  [🏷️ Ofertas]  [Cobrar]                                 │
│                                                         │
│  Pestaña activa: [Productos ✓]  [Comida]                │
│  ← El botón Ofertas está visible porque                 │
│    estamos en pestaña Productos                         │
└─────────────────────────────────────────────────────────┘
```

**Mobile**: El botón "Ofertas" aparece en la misma fila de acciones, con ícono compacto `🏷️` y texto "Ofertas".

#### Sheet de ofertas

Al presionar "Ofertas" se abre un **Sheet** (panel lateral desde abajo en mobile, desde la derecha en desktop) con:

```
┌──────────────────────────────────────┐
│  🏷️ Ofertas disponibles        [✕]  │
├──────────────────────────────────────┤
│  🔍 Buscar oferta...                │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🏷️ 2 Coca 500ml por $3.000   │  │
│  │    Coca Cola 500ml ×2         │  │
│  │    $3.000        [+ Agregar]  │  │
│  │    🟢 Stock disponible        │  │
│  ├────────────────────────────────┤  │
│  │ 🏷️ Fernet + Coca             │  │
│  │    Fernet 750ml ×1,           │  │
│  │    Coca Cola 1.5L ×1          │  │
│  │    $8.000        [+ Agregar]  │  │
│  │    🟢 Stock disponible        │  │
│  ├────────────────────────────────┤  │
│  │ 🏷️ 3 Quilmes Lata            │  │
│  │    Quilmes Lata ×3            │  │
│  │    $4.500                     │  │
│  │    🔴 Sin stock (falta: 1)    │  │
│  │    [Agregar] ← deshabilitado  │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

**Comportamiento**:
- Al tocar "Agregar" → se agrega la oferta al carrito con qty=1, se cierra el sheet.
- Si la oferta ya está en el carrito → se incrementa la cantidad.
- Ofertas sin stock suficiente: botón deshabilitado, indicador rojo con detalle de qué falta.

#### Línea de oferta en el carrito

La línea de oferta se distingue visualmente de las líneas normales:

```
┌──────────────────────────────────────────────┐
│ Carrito                                      │
├──────────────────────────────────────────────┤
│                                              │
│  Coca Cola 500ml                    $1.500   │
│  [−] 1 [+]                          🗑       │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🏷️ OFERTA                             │  │
│  │ Fernet + Coca                 $8.000   │  │
│  │ [−] 1 [+]                        🗑   │  │
│  │ ┌─ Desglose ────────────────────────┐ │  │
│  │ │  • Fernet 750ml ×1               │ │  │
│  │ │  • Coca Cola 1.5L ×1             │ │  │
│  │ └──────────────────────────────────┘ │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Quilmes Lata                       $1.500   │
│  [−] 2 [+]                          🗑       │
│                                              │
├──────────────────────────────────────────────┤
│  Subtotal Local          $12.500             │
│  Total                   $12.500             │
│                                              │
│  [Cobrar $12.500]                            │
└──────────────────────────────────────────────┘
```

**Detalles de diseño**:
- Badge "OFERTA" con color accent (ej. amber/yellow) para diferenciar.
- Fondo ligeramente diferente (ej. `bg-accent/10` o borde izquierdo de color).
- Desglose de componentes visible por defecto, colapsable con chevron.
- Los componentes del desglose NO son editables individualmente.
- Se puede cambiar la cantidad de la oferta completa (×1, ×2, etc.) con +/−.
- Se puede eliminar la oferta completa con el ícono de papelera.
- **Todas las ofertas suman a `subtotal_local` porque todos sus componentes son LOCAL.**

#### Comportamiento ante cambio de cantidad de oferta

- Al incrementar cantidad de la oferta:
  - Validar stock de todos los componentes × nueva cantidad.
  - Si no alcanza → revertir incremento + toast de error.
- Al decrementar:
  - Mínimo 1; si llega a 0, se elimina la línea.

#### Comportamiento ante stock insuficiente durante cobro

Si entre que se agregó la oferta y el momento de cobrar otro cajero vendió stock:

1. Al presionar "Cobrar" se revalida stock.
2. Si falta stock → no se abre checkout, se muestra toast: "Stock insuficiente para la oferta '{nombre}'. Falta: {producto} ({cantidad})."
3. El cajero debe ajustar o remover la oferta antes de cobrar.

---

## E. Modelo de datos propuesto

### E.1 Nuevas tablas

#### Tabla: `offers`

Cabecera de cada oferta creada por el administrador.

| Campo | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `name` | text | NO | — | Nombre visible de la oferta |
| `type` | text | NO | — | `'QUANTITY'` o `'COMBO'` |
| `offer_price` | integer | NO | — | Precio promocional en pesos (entero) |
| `is_active` | boolean | NO | `true` | Si está disponible en CAJA |
| `created_at` | timestamptz | NO | `now()` | Fecha de creación |
| `updated_at` | timestamptz | YES | `now()` | Última modificación |
| `created_by` | text | NO | `'admin'` | Usuario que la creó |

**Índices**:
- PK en `id`
- Índice en `is_active` para filtrar rápido en CAJA

**RLS**: Mismo patrón que el resto (`Allow all access`), ya que la protección es por rol en el frontend.

---

#### Tabla: `offer_items`

Componentes de cada oferta: qué productos LOCAL y en qué cantidad.

| Campo | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `offer_id` | uuid | NO | — | FK → `offers.id` |
| `product_id` | uuid | NO | — | FK → `products.id` (**siempre obligatorio, solo LOCAL**) |
| `qty` | integer | NO | — | Cantidad de este componente en la oferta |
| `sort_order` | integer | NO | `0` | Orden de visualización |

**Nota importante**: A diferencia de la v1 del documento, `product_id` es **NOT NULL** y **no existe** `restaurant_item_id`. Esto garantiza a nivel de esquema que las ofertas solo pueden componerse de productos LOCAL.

**Restricciones**:
- `product_id` es obligatorio (NOT NULL)
- `qty ≥ 1`
- FK `offer_id` → `offers.id` ON DELETE CASCADE
- FK `product_id` → `products.id`

**Índices**:
- PK en `id`
- Índice en `offer_id`

---

#### Tabla: `pos_sale_item_components`

Registra el desglose real de qué productos LOCAL se consumieron por cada línea de oferta vendida. Esta tabla es la clave de la trazabilidad.

| Campo | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | PK |
| `sale_item_id` | uuid | NO | — | FK → `pos_sale_items.id` (la línea de oferta) |
| `product_id` | uuid | NO | — | FK → `products.id` (**siempre obligatorio, solo LOCAL**) |
| `name_snapshot` | text | NO | — | Nombre del producto LOCAL al momento de la venta |
| `qty` | integer | NO | — | Cantidad real consumida (componente_qty × oferta_qty) |
| `unit_cost_snapshot` | integer | NO | `0` | `cost_price` del producto al momento de la venta |
| `line_cost` | integer | NO | `0` | `unit_cost_snapshot × qty` |

**Nota**: `product_id` es NOT NULL y **no existe** `restaurant_item_id`. Solo productos LOCAL.

**Relaciones**:
- `sale_item_id` → `pos_sale_items.id` ON DELETE CASCADE
- `product_id` → `products.id`

**Propósito**: Permite saber exactamente qué productos LOCAL se consumieron, sus costos al momento de la venta, y vincularlos a la línea comercial de oferta.

---

### E.2 Cambios en tablas existentes

#### `pos_sale_items` — Campos nuevos

| Campo nuevo | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `offer_id` | uuid | YES | `null` | FK → `offers.id` — referencia a la oferta aplicada |
| `offer_name_snapshot` | text | YES | `null` | Nombre de la oferta al momento de la venta |
| `offer_price_snapshot` | integer | YES | `null` | Precio de la oferta al momento de la venta |

**Valor de `item_type`**: Se agrega un nuevo valor `'OFFER'` al campo `item_type`. Como `item_type` es `text` y no un enum, no requiere migración de tipo.

**Cuando `item_type = 'OFFER'`**:
- `product_id` = null
- `restaurant_item_id` = null
- **`owner` = `'LOCAL'` siempre** (no existe MIXED ni RESTAURANTE para ofertas)
- `unit_price` = precio de la oferta (o con recargo si aplica)
- `unit_price_base_snapshot` = `offer_price` original
- `cost_snapshot` = suma de `line_cost` de todos los componentes en `pos_sale_item_components`
- `name_snapshot` = nombre de la oferta
- `line_total` = `unit_price × qty`
- `sent_to_kitchen` = `false` (las ofertas **nunca** se envían a cocina)

---

#### `stock_movements` — Trazabilidad

##### El problema actual

Hoy `stock_movements` no tiene referencia directa a la venta que lo generó. El campo `reason` guarda "Venta POS" como texto libre.

##### Recomendación: Agregar `sale_id`

**Agregar `sale_id` (uuid, nullable)** a `stock_movements`:

- Es el cambio mínimo que aporta trazabilidad real.
- Permite queries como: "¿qué movimientos de stock generó la venta X?"
- El `reason` se enriquece para indicar si fue oferta: `"Venta POS — Oferta: Fernet + Coca"`.
- No requiere cambios en el flujo de movimientos existentes (ventas actuales generan movimientos con `sale_id = null`).

**Campo a agregar**:

| Campo | Tipo | Nullable | Default | Descripción |
|---|---|---|---|---|
| `sale_id` | uuid | YES | `null` | Referencia a `pos_sales.id` |

No se crea FK formal para evitar complejidad; la referencia es lógica.

---

### E.3 Diagrama de relaciones

```
offers ────────< offer_items
  │                   │
  │                   └──→ products (product_id, NOT NULL)
  │
  │ (referenciado por snapshot)
  │
pos_sales ────< pos_sale_items ────< pos_sale_item_components
                  │                        │
                  │ offer_id (nullable)     └──→ products (product_id, NOT NULL)
                  │ item_type = 'OFFER'
                  │ owner = 'LOCAL'
                  │
                  └──→ offers (offer_id)

stock_movements
  │
  └── sale_id (nullable) → pos_sales.id (referencia lógica)
  └── product_id → products.id
```

**Nota**: Todas las flechas hacia `products` son obligatorias (NOT NULL). No hay ninguna referencia a `restaurant_items` en el modelo de ofertas.

---

## F. Diseño transaccional y de consistencia

### F.1 Flujo para DELIVERY (createSale) — con ofertas

```
createSale() — versión extendida con ofertas
═══════════════════════════════════════════════════════

Paso 1: VALIDACIÓN DE STOCK CONSOLIDADA
─────────────────────────────────────────────────────
  Acumular stock requerido por product_id:
    - Items normales LOCAL con track_stock=true:
      → product_id: qty
    - Items OFFER:
      → Para cada componente de la oferta:
        → Si track_stock=true:
          → Acumular: product_id: componente.qty × oferta.qty
  
  Para cada product_id acumulado:
    → Consultar stock_balances.qty_on_hand
    → Si qty_on_hand < total_requerido → ABORT con error

Paso 2: INSERTAR pos_sales
─────────────────────────────────────────────────────
  Calcular subtotales:
    subtotal_local = Σ line_total de items LOCAL normales
                   + Σ line_total de ofertas (owner='LOCAL' siempre)
    subtotal_restaurant = Σ line_total de items RESTAURANTE normales
                          (ofertas NUNCA suman aquí)
    total = subtotal_local + subtotal_restaurant + delivery_fee

  INSERT pos_sales → obtener sale_id

Paso 3: INSERTAR pos_sale_items
─────────────────────────────────────────────────────
  Para cada item del carrito:
    Si es item normal:
      → INSERT pos_sale_items como hoy
    Si es item OFFER:
      → INSERT pos_sale_items con:
        - item_type = 'OFFER'
        - offer_id = oferta.id
        - offer_name_snapshot = oferta.name
        - offer_price_snapshot = oferta.offer_price
        - unit_price = precio con recargo si aplica
        - unit_price_base_snapshot = oferta.offer_price
        - cost_snapshot = Σ (component.unit_cost × component.qty × oferta.qty)
        - name_snapshot = oferta.name
        - product_id = null
        - restaurant_item_id = null
        - owner = 'LOCAL'
        - sent_to_kitchen = false
      → Obtener sale_item_id

Paso 4: INSERTAR pos_sale_item_components
─────────────────────────────────────────────────────
  Para cada línea OFFER insertada:
    Para cada componente de la oferta:
      → INSERT pos_sale_item_components:
        - sale_item_id = el id de la línea OFFER
        - product_id = componente.product_id (NOT NULL, LOCAL)
        - name_snapshot = nombre del producto LOCAL
        - qty = componente.qty × oferta.qty_en_carrito
        - unit_cost_snapshot = product.cost_price
        - line_cost = unit_cost_snapshot × qty

Paso 5: INSERTAR pos_payments
─────────────────────────────────────────────────────
  → Mismo flujo actual, sin cambios

Paso 6: DESCONTAR STOCK
─────────────────────────────────────────────────────
  Para cada item normal con track_stock=true:
    → Mismo flujo actual

  Para cada línea OFFER:
    Para cada componente con track_stock=true:
      → INSERT stock_movements:
        - product_id = componente.product_id
        - type = 'SALE'
        - qty = componente.qty × oferta.qty
        - reason = 'Venta POS — Oferta: {offer_name}'
        - sale_id = sale_id (NUEVO)
        - created_by = cashier_id
      → UPDATE stock_balances:
        - qty_on_hand -= qty

Paso 7: RETORNAR
─────────────────────────────────────────────────────
  → { saleId, total }
```

### F.2 Flujo para tabs/cuentas abiertas — con ofertas

#### Al agregar oferta a la tab (`addItemToTab`)

```
addOfferToTab() — extensión de addItemToTab
═══════════════════════════════════════════════════════

Paso 1: VALIDACIÓN DE STOCK (warning, no descuento)
─────────────────────────────────────────────────────
  Para cada componente de la oferta:
    Si track_stock = true:
      → Consultar stock_balances.qty_on_hand
      → Si qty_on_hand < componente.qty × oferta.qty → ABORT con toast

Paso 2: PERSISTIR LÍNEA DE OFERTA EN pos_sale_items
─────────────────────────────────────────────────────
  INSERT pos_sale_items con:
    - sale_id = tab.id
    - item_type = 'OFFER'
    - offer_id = oferta.id
    - offer_name_snapshot = oferta.name
    - offer_price_snapshot = oferta.offer_price
    - unit_price = precio con recargo según price_term actual
    - unit_price_base_snapshot = oferta.offer_price
    - cost_snapshot = Σ (component.cost_price × component.qty)
    - name_snapshot = oferta.name
    - product_id = null
    - restaurant_item_id = null
    - owner = 'LOCAL'
    - sent_to_kitchen = false

Paso 3: RECALCULAR TOTALES DE LA TAB
─────────────────────────────────────────────────────
  recalcTotals(saleId):
    subtotal_local += oferta.line_total
    subtotal_restaurant → sin cambios
    total = subtotal_local + subtotal_restaurant

  NO se descuenta stock.
  NO se crean movimientos.
  NO se insertan pos_sale_item_components aún.
```

#### Al cerrar/cobrar la tab (`closeTab`) — con ofertas

```
closeTab() — versión extendida con ofertas
═══════════════════════════════════════════════════════

Paso 1: OBTENER ITEMS DE LA TAB
─────────────────────────────────────────────────────
  Obtener todos los items de pos_sale_items para esta tab.
  Separar items normales de items OFFER.

Paso 2: VALIDACIÓN DE OFERTAS ACTIVAS
─────────────────────────────────────────────────────
  Para cada item con item_type = 'OFFER':
    → Consultar offers.is_active donde id = offer_id
    → Si la oferta fue desactivada → ABORT:
      "La oferta '{nombre}' fue desactivada. 
       Removela de la cuenta para poder cobrar."

Paso 3: VALIDACIÓN DE STOCK CONSOLIDADA
─────────────────────────────────────────────────────
  Acumular stock requerido por product_id:
    - Items normales LOCAL con track_stock=true:
      → product_id: qty
    - Items OFFER:
      → Para cada componente (consultar offer_items):
        → Si track_stock=true:
          → Acumular: product_id: componente.qty × oferta.qty
  
  Para cada product_id acumulado:
    → Consultar stock_balances.qty_on_hand
    → Si qty_on_hand < total_requerido → ABORT con error

Paso 4: INSERTAR pos_sale_item_components
─────────────────────────────────────────────────────
  Para cada item OFFER en la tab:
    Para cada componente de la oferta:
      → INSERT pos_sale_item_components:
        - sale_item_id = item.id
        - product_id = componente.product_id (NOT NULL, LOCAL)
        - name_snapshot = nombre del producto LOCAL
        - qty = componente.qty × oferta.qty
        - unit_cost_snapshot = product.cost_price
        - line_cost = unit_cost_snapshot × qty

Paso 5: INSERTAR PAGOS
─────────────────────────────────────────────────────
  → Mismo flujo actual de closeTab

Paso 6: DESCONTAR STOCK
─────────────────────────────────────────────────────
  Para cada item normal con track_stock=true:
    → Mismo flujo actual
  
  Para cada item OFFER:
    Para cada componente con track_stock=true:
      → INSERT stock_movements:
        - product_id = componente.product_id
        - type = 'SALE'
        - qty = componente.qty × oferta.qty
        - reason = 'Venta POS — Oferta: {offer_name}'
        - sale_id = tab.id (NUEVO)
        - created_by = cashier_id
      → UPDATE stock_balances:
        - qty_on_hand -= qty

Paso 7: MARCAR COMPLETED
─────────────────────────────────────────────────────
  UPDATE pos_sales SET status = 'COMPLETED', closed_at = now()

Paso 8: RETORNAR
─────────────────────────────────────────────────────
  → { saleId, total }
```

### F.3 Validaciones críticas (resumen)

| Momento | Validación | Consecuencia si falla |
|---|---|---|
| Agregar oferta al carrito/tab | Stock disponible para todos los componentes LOCAL | No se agrega, toast de error |
| Incrementar qty de oferta | Stock disponible para la nueva cantidad total | No se incrementa, toast de error |
| Presionar "Cobrar" (DELIVERY) | Re-validación de stock de todo el carrito | No se abre checkout, toast con detalle |
| Cerrar tab (closeTab) | Re-validación de stock + ofertas activas | No se cobra, toast con detalle |
| Confirmar pago | Validación final antes de INSERT/descuento | Error, no se procesa la venta |

---

## G. Reglas de negocio detalladas

### G.1 Productos con `track_stock = false`

- Los componentes de oferta que son productos con `track_stock = false` no se validan contra stock ni generan movimientos en `stock_movements`.
- Sí se registran en `pos_sale_item_components` para trazabilidad de costos y auditoría.
- Su `cost_snapshot` se calcula normalmente desde `products.cost_price`.

### G.2 Owner de la línea OFFER

**Regla simple**: el owner de una línea OFFER en `pos_sale_items` es **siempre `'LOCAL'`**.

No existe owner `'MIXED'` ni `'RESTAURANTE'` para ofertas. Esto elimina completamente la complejidad de prorrateo entre subtotales.

**Impacto financiero**:
- Todo el monto de la oferta va a `subtotal_local`.
- `subtotal_restaurant` **nunca** se ve afectado por ofertas.

### G.3 Oferta desactivada mientras está en carrito o tab

- **Carrito en memoria (DELIVERY)**: No hay conflicto porque el carrito se crea y cobra en la misma sesión. Si se desactiva la oferta entre sesiones, el carrito se pierde al recargar.
- **Tab/cuenta abierta**: La línea OFFER persiste en `pos_sale_items` aunque la oferta se desactive. Al intentar cerrar/cobrar la tab, se revalida que la oferta siga activa. Si fue desactivada → bloqueo del cobro con toast: "La oferta '{nombre}' fue desactivada. Removela de la cuenta para poder cobrar."
- En ambos casos, al intentar cobrar se verifica que la oferta siga activa.

### G.4 Cambios de precios base después de crear la oferta

- El precio de la oferta (`offer_price`) es fijo e independiente de los precios de los componentes.
- Si el admin sube el precio de la Coca Cola, la oferta "2 Cocas por $3000" sigue costando $3000.
- El "precio referencia individual" se recalcula dinámicamente en admin, pero es solo informativo.
- El `cost_snapshot` en la venta se calcula con el `cost_price` vigente al momento de la venta.

### G.5 Snapshots que deben guardarse

| Dato | Dónde se guarda | Por qué |
|---|---|---|
| Nombre de la oferta | `pos_sale_items.offer_name_snapshot` | Ventas históricas mantienen nombre original |
| Precio de la oferta | `pos_sale_items.offer_price_snapshot` | Ventas históricas mantienen precio cobrado |
| Precio con recargo | `pos_sale_items.unit_price` | Precio real cobrado |
| Precio base | `pos_sale_items.unit_price_base_snapshot` | Para calcular recargos |
| Costo total | `pos_sale_items.cost_snapshot` | COGS real de la oferta |
| Nombre componente | `pos_sale_item_components.name_snapshot` | Si el producto se renombra |
| Costo componente | `pos_sale_item_components.unit_cost_snapshot` | COGS detallado |
| Cantidad componente | `pos_sale_item_components.qty` | Cantidad real consumida |

### G.6 Visibilidad en ticket

```
─────────────────────────────────
OFERTA: 2 Coca 500ml por $3.000
  • Coca Cola 500ml ×2
                        $3.000
─────────────────────────────────
OFERTA: Fernet + Coca
  • Fernet 750ml ×1
  • Coca Cola 1.5L ×1
                        $8.000
─────────────────────────────────
```

### G.7 Visibilidad del cajero en CAJA

El cajero ve:
- El nombre de la oferta como label principal de la línea.
- Un badge "OFERTA" para distinguirlo visualmente.
- El precio de la oferta (con recargo si aplica).
- El desglose de componentes expandible (solo productos LOCAL).
- No puede editar componentes individuales.
- Puede cambiar la cantidad de la oferta completa.
- Puede eliminar la oferta completa.

### G.8 Repetir una oferta varias veces

- Al tocar una oferta que ya está en el carrito → se incrementa `qty` de la línea existente.
- No se crea una segunda línea; se reutiliza la existente.
- La validación de stock se hace por `qty_componente × qty_oferta_total`.
- En `pos_sale_item_components`, la cantidad registrada al cobrar es `componente.qty × oferta.qty_final`.

### G.9 Evitar descuentos dobles

- Una oferta YA ES un descuento (precio menor al precio individual de los componentes).
- **No se permite** aplicar descuentos manuales adicionales sobre una línea de oferta.
- El cajero no puede modificar el `unit_price` de una línea OFFER.

### G.10 Cantidades y límites

- No hay límite máximo de ofertas diferentes en un ticket.
- No hay límite máximo de repeticiones de la misma oferta (más allá del stock).
- No hay límite por cliente (no existe módulo de clientes).
- El límite real es el stock disponible de los productos LOCAL.

### G.11 Bloqueo de restaurant_items en ofertas

- El sistema **DEBE impedir** que un administrador incluya `restaurant_items` en una oferta.
- El selector de productos en el formulario de ofertas **solo muestra productos de la tabla `products`**.
- La tabla `offer_items` **no tiene columna `restaurant_item_id`**, lo que garantiza a nivel de esquema que es imposible vincular un restaurant_item a una oferta.
- Si por alguna razón se intenta un INSERT con un ID que no existe en `products`, la FK lo bloquea.

---

## H. Impacto sobre reportes y márgenes

### H.1 Subtotales

Las líneas OFFER **siempre** contribuyen a `subtotal_local`:
- `owner = 'LOCAL'` → suma a `subtotal_local`
- **Nunca** suma a `subtotal_restaurant`

El total de la venta sigue siendo: `subtotal_local + subtotal_restaurant + delivery_fee`.

### H.2 Payment lines

Sin cambios. Los pagos se calculan sobre el `total` de la venta. El total ya incluye las ofertas a su precio promocional. Los recargos por término de pago se aplican sobre el total como siempre.

### H.3 Margen por línea

Para una línea OFFER:
```
Ingreso bruto = unit_price × qty
COGS          = cost_snapshot (= Σ component.line_cost)
Margen bruto  = Ingreso bruto - COGS
```

Ejemplo:
```
Oferta: Fernet + Coca por $8.000
Componentes:
  - Fernet 750ml  (cost_price: $4.000) ×1 → line_cost = $4.000
  - Coca Cola 1.5L (cost_price: $800)  ×1 → line_cost = $800

cost_snapshot = $4.800
Margen = $8.000 - $4.800 = $3.200
```

Si se vende con término CREDITO_1 (recargo 10%):
```
unit_price = $8.800 (8.000 × 1.10)
surcharge = $800
Ingreso neto = $8.000
Margen real = $8.000 - $4.800 = $3.200
```

### H.4 COGS

- El COGS de una oferta se calcula desde los componentes reales LOCAL.
- Todos los componentes son productos con `cost_price` definido.
- El COGS se guarda como snapshot en `pos_sale_items.cost_snapshot`.
- El desglose por componente está en `pos_sale_item_components`.

### H.5 `v_finance_movements`

La vista `v_finance_movements` sigue funcionando sin cambios porque:
- Los pagos se registran igual en `pos_payments`.
- El `total` de `pos_sales` ya incluye las ofertas.
- `amount_local` se deriva de `subtotal_local`, que ahora incluye las ofertas.
- `subtotal_restaurant` no se ve afectado por ofertas.

**Query de reporte de ofertas**:
```sql
SELECT 
  psi.offer_name_snapshot,
  COUNT(*) as veces_vendida,
  SUM(psi.line_total) as ingreso_total,
  SUM(psi.cost_snapshot) as cogs_total,
  SUM(psi.line_total - psi.cost_snapshot) as margen_total
FROM pos_sale_items psi
WHERE psi.item_type = 'OFFER'
  AND psi.sale_id IN (SELECT id FROM pos_sales WHERE status = 'COMPLETED')
GROUP BY psi.offer_name_snapshot
ORDER BY ingreso_total DESC;
```

---

## I. Riesgos y puntos delicados

### I.1 Riesgos funcionales

| # | Problema | Consecuencia | Recomendación |
|---|---|---|---|
| F1 | Cajero agrega oferta sin entender qué incluye | Confusión, reclamos del cliente | Mostrar desglose visible siempre |
| F2 | Admin crea oferta con precio mayor al individual | Oferta contraproducente | Warning en formulario (no bloqueo) |
| F3 | Oferta con componente desactivado | Oferta no vendible aunque esté activa | Al desactivar un producto, advertir si es componente de oferta activa |
| F4 | Muchas ofertas activas saturan el sheet | Cajero no encuentra la oferta rápido | Incluir buscador en el sheet |

### I.2 Riesgos de datos

| # | Problema | Consecuencia | Recomendación |
|---|---|---|---|
| D1 | Se elimina un producto que es componente de oferta | FK rota o oferta huérfana | Validar antes de eliminar: "Este producto es componente de la oferta X" |
| D2 | Se edita oferta con ventas asociadas | Datos históricos inconsistentes | Los snapshots protegen datos históricos |
| D3 | `cost_price` cambia después de la venta | COGS histórico incorrecto | Se usa `cost_snapshot` capturado al momento de la venta |
| D4 | Tabla `pos_sale_item_components` crece rápido | Performance | Índice en `sale_item_id`, queries con rango de fechas |

### I.3 Riesgos de UX

| # | Problema | Consecuencia | Recomendación |
|---|---|---|---|
| U1 | Botón "Ofertas" no visible en mobile | Cajero no lo encuentra | Ubicarlo con ícono claro en fila de acciones |
| U2 | Desglose de componentes ocupa mucho espacio | Carrito largo | Desglose colapsable |
| U3 | Cajero no entiende por qué no puede cobrar (stock) | Frustración | Mensaje específico: "Falta stock de {producto}" |
| U4 | Admin crea combo con 10 componentes | Formulario difícil | Limitar a máximo 6 componentes en MVP |

### I.4 Riesgos de trazabilidad

| # | Problema | Consecuencia | Recomendación |
|---|---|---|---|
| T1 | Movimiento SALE sin referencia a oferta | No se puede auditar | Enriquecer `reason` + agregar `sale_id` |
| T2 | Componentes de oferta no registrados | Se pierde qué se vendió | `pos_sale_item_components` resuelve esto |
| T3 | Cambio retroactivo en offer_items | Confusión | Los snapshots protegen esto |

### I.5 Riesgos de consistencia transaccional

| # | Problema | Consecuencia | Recomendación |
|---|---|---|---|
| C1 | Stock cambia entre validación y descuento | Stock negativo | Revalidar stock justo antes de descontar |
| C2 | Falla parcial: items sin descuento de stock | Inconsistencia | Orden: insertar todo, luego descontar; si falla, no marcar COMPLETED |
| C3 | Dos cajeros cobran misma oferta con stock limitado | Stock negativo potencial | Validación secuencial mitiga; locks para alta concurrencia (fuera de MVP) |
| C4 | Stock cambia entre agregar oferta a tab y cerrar cuenta | Stock insuficiente al cobrar | Revalidación obligatoria al cierre; bloqueo del cobro si no alcanza. No se implementa reserva de stock en MVP. |
| C5 | Oferta desactivada mientras está en tab abierta | Línea huérfana en la cuenta | Revalidar ofertas activas al cierre; bloquear cobro si alguna fue desactivada. Cajero debe removerla. |

---

## J. Recomendación final de arquitectura

### Modelo recomendado

**Oferta como regla comercial exclusivamente LOCAL** con desglose de consumo real por venta.

Esta decisión de restringir ofertas a productos LOCAL **reduce significativamente la complejidad** porque:

1. **Elimina owner MIXED**: No existe el caso de una oferta con componentes de distinto owner. El owner siempre es `'LOCAL'`.
2. **Elimina interacción con cocina**: Las ofertas nunca se envían a cocina. No hay `sent_to_kitchen`, no hay `kitchen_state`, no hay `kitchen_batch_id` para ofertas.
3. **Elimina `restaurant_item_id` del modelo de ofertas**: `offer_items` y `pos_sale_item_components` solo referencian `products`. Menos columnas, menos nulls, schema más limpio.
4. **Elimina prorrateo de subtotales**: No hay que calcular cuánto de la oferta va a `subtotal_local` vs `subtotal_restaurant`. Todo va a `subtotal_local`.
5. **Simplifica la validación de stock**: Solo hay que validar `stock_balances` de productos LOCAL. Los `restaurant_items` no tienen stock trackeado.

### Tablas recomendadas (nuevas)

| Tabla | Propósito | Registros estimados |
|---|---|---|
| `offers` | Catálogo de ofertas (solo LOCAL) | Decenas |
| `offer_items` | Componentes de cada oferta (solo `product_id`) | Decenas-centenas |
| `pos_sale_item_components` | Desglose real por venta (solo `product_id`) | Crece con ventas |

### Cambios mínimos en tablas existentes

| Tabla | Cambio | Impacto |
|---|---|---|
| `pos_sale_items` | +3 campos nullable (`offer_id`, `offer_name_snapshot`, `offer_price_snapshot`) | Bajo: campos opcionales |
| `stock_movements` | +1 campo nullable (`sale_id`) | Bajo: campo opcional |

### Camino de implementación sugerido

#### Fase 1: Base de datos (1 sesión)
1. Crear tabla `offers` con RLS.
2. Crear tabla `offer_items` con RLS y FK a `products` (NOT NULL).
3. Crear tabla `pos_sale_item_components` con RLS y FK a `products` (NOT NULL).
4. Agregar campos a `pos_sale_items`.
5. Agregar `sale_id` a `stock_movements`.

#### Fase 2: Administración de ofertas (1-2 sesiones)
1. Crear página `/ofertas` con listado.
2. Crear formulario de alta/edición con selector de **solo productos LOCAL**.
3. Implementar activar/desactivar.
4. Agregar al menú lateral (solo admin).

#### Fase 3: Integración en CAJA (2-3 sesiones)
1. Botón "Ofertas" en la barra de acciones (visible solo en pestaña Productos, tanto en DELIVERY como en tabs).
2. Sheet de selección de ofertas con validación de stock.
3. Línea de oferta en carrito/tab con desglose (owner = LOCAL siempre).
4. Modificar `createSale` para soportar ofertas (items + components + stock).
5. Modificar `closeTab` para soportar ofertas (revalidación + components + stock al cierre).
6. Modificar `addItemToTab` para persistir líneas OFFER en tabs.
7. Validación de stock consolidada (normales + componentes de ofertas).

#### Fase 4: Trazabilidad y reportes (1 sesión)
1. Pasar `sale_id` a `stock_movements` en todas las ventas.
2. Enriquecer `reason` con nombre de oferta.
3. Verificar que `v_finance_movements` sigue funcionando.
4. Query de ejemplo para reporte de ofertas.

#### Fase 5: Testing y ajustes (1 sesión)
1. Probar flujo completo DELIVERY con oferta.
2. Probar flujo completo tab/cuenta abierta con oferta.
3. Probar edge cases: stock insuficiente, oferta desactivada, cambio de precio, stock agotado entre agregar a tab y cerrar.
4. Verificar ticket impreso.
5. Verificar reportes financieros.

---

### Evolución futura (fuera del MVP)

| Funcionalidad | Fase sugerida | Complejidad |
|---|---|---|
| Ofertas automáticas | v2 | Alta |
| Descuento porcentual por línea | v2 | Media |
| Ofertas por categoría abierta ("cualquier bebida") | v2 | Alta |
| Ofertas por medio de pago | v2 | Media |
| Ofertas por horario / día de la semana | v3 | Media |
| Límite de usos por oferta (cupo) | v3 | Baja |
| Ofertas por cliente / fidelización | v3+ | Alta (requiere módulo clientes) |
| Motor de reglas apilable | v4+ | Muy alta |
| Ofertas con componentes RESTAURANTE (combos mixtos) | v2+ | Media |

---

> **Fin del documento — v3.0**  
> Cambio principal respecto a v2: las ofertas **SÍ aplican en tabs/cuentas abiertas** (solo para productos LOCAL).  
> El stock se valida al agregar pero se descuenta solo al cerrar/cobrar. No hay reserva de stock en MVP.  
> No se incluyen `restaurant_items`, no se afecta cocina, no se afecta `subtotal_restaurant`.  
> Este documento está listo para ser revisado antes de iniciar la implementación.  
> No se ha modificado código ni base de datos.
