# Lógica Financiera del Sistema POS

## Resumen General

El sistema maneja un flujo financiero completo desde el cobro al cliente hasta el cálculo de ganancia neta, considerando recargos por medios de pago, costos de mercadería y gastos operativos.

---

## 1. Sistema de Precios Multicanal

### Canales
- **RESTAURANTE**: ventas en el local (comida del restaurante + productos locales)
- **DELIVERY**: ventas por delivery

### Términos de Precio (por canal)
Cada producto tiene 4 precios por canal:

| Término | Descripción |
|---------|-------------|
| **BASE** | Precio base sin recargo. Métodos de pago: Efectivo o Transferencia |
| **DEBITO** | Precio con recargo por débito. Método: Tarjeta |
| **CREDITO_1** | Precio con recargo por crédito 1 cuota. Método: Tarjeta |
| **CREDITO_3** | Precio con recargo por crédito 3 cuotas. Método: Tarjeta |

### Cálculo de Precios Derivados
Los precios de DEBITO, CREDITO_1 y CREDITO_3 se calculan automáticamente a partir del precio BASE usando porcentajes globales configurables:

```
precio_debito    = precio_base × (1 + debit_pct / 100)
precio_credito_1 = precio_base × (1 + credit_1_pct / 100)
precio_credito_3 = precio_base × (1 + credit_3_pct / 100)
```

Ejemplo con BASE = $1000, debit_pct = 5%, credit_1_pct = 10%, credit_3_pct = 20%:
- DEBITO: $1050
- CREDITO_1: $1100
- CREDITO_3: $1200

### Ítems de Restaurante (Comida)
Los ítems de comida tienen un único precio base. Cuando se agregan al POS con un término distinto a BASE, se les aplica el mismo porcentaje de recargo dinámicamente:

```
precio_comida_con_recargo = precio_comida × (1 + porcentaje_termino / 100)
```

---

## 2. Estructura de una Venta

### Tabla `pos_sales`
```
- channel: "RESTAURANTE" | "DELIVERY"
- price_term: "BASE" | "DEBITO" | "CREDITO_1" | "CREDITO_3"
- subtotal_local: suma de line_total de ítems owner=LOCAL
- subtotal_restaurant: suma de line_total de ítems owner=RESTAURANTE
- delivery_fee: cargo de envío (solo en DELIVERY)
- total: subtotal_local + subtotal_restaurant + delivery_fee
- status: "OPEN" | "COMPLETED" | "CANCELLED"
```

### Tabla `pos_sale_items` (líneas de la venta)
```
- owner: "LOCAL" | "RESTAURANTE"
- item_type: "PRODUCT" | "RESTAURANT_ITEM"
- unit_price: precio cobrado al cliente (con recargo incluido)
- unit_price_base_snapshot: precio base SIN recargo (snapshot al momento de la venta)
- cost_snapshot: costo de mercadería del producto (snapshot al momento de la venta)
- qty: cantidad vendida
- line_total: unit_price × qty
```

**Importancia de los snapshots**: Se guardan los valores al momento de la venta para que los cálculos financieros futuros no se vean afectados por cambios de precios posteriores.

### Tabla `pos_payments` (pagos de la venta)
```
- payment_method: "EFECTIVO" | "QR" | "TRANSFERENCIA" | "TARJETA"
- fund: "EFECTIVO" | "MERCADOPAGO" (derivado del método)
- amount: monto pagado
- surcharge_amount: porción del pago que corresponde al recargo
```

**Regla de fondos**:
- EFECTIVO → fondo EFECTIVO
- QR, TRANSFERENCIA, TARJETA → fondo MERCADOPAGO

---

## 3. Cálculo del Interés / Recargo por Medio de Pago

El "interés" es la diferencia entre lo que se le cobra al cliente (precio con recargo) y el precio base real del producto. Este monto **no es ganancia real** porque se destina a cubrir el costo de la plataforma de pago (MercadoPago, procesador de tarjetas, etc.).

### Fórmula por ítem:
```
interes_item = (unit_price - unit_price_base_snapshot) × qty
```

### Ejemplo:
- Producto con precio BASE = $1000, vendido en CREDITO_1 (10% recargo)
- unit_price = $1100, unit_price_base_snapshot = $1000, qty = 2
- interés = ($1100 - $1000) × 2 = $200

### Agregado por día:
```
interes_dia = Σ (unit_price - unit_price_base_snapshot) × qty
              para todos los items con owner = "LOCAL" y status = "COMPLETED"
```

---

## 4. Flujo Contable: Del Cobro a la Ganancia

### Conceptos clave:

| Concepto | Fórmula | Significado |
|----------|---------|-------------|
| **Bruto** | Σ cobros al cliente (monto total de ventas LOCAL) | Lo que pagó el cliente |
| **Interés MP** | Σ (precio_cobrado - precio_base) × qty | Recargo que se queda la plataforma de pago |
| **Real (Acreditado)** | Bruto - Interés MP | Lo que realmente ingresa al negocio |
| **COGS** | Σ cost_snapshot × qty (solo LOCAL) | Costo de mercadería vendida |
| **Gastos** | Σ expenses (no pass-through) | Gastos operativos del día |
| **Ganancia** | Real - COGS - Gastos | Resultado neto del día |

### Visualización del flujo:
```
Cliente paga: $11,000 (Bruto)
  └─ Interés MP: -$1,000 (se queda la plataforma)
  └─ Acreditado: $10,000 (lo que llega al negocio)
      └─ Costo mercadería: -$5,000
      └─ Gastos operativos: -$2,000
      └─ GANANCIA NETA: $3,000
```

---

## 5. Capital por Fondo

El sistema trackea el saldo de cada fondo (EFECTIVO y MERCADOPAGO):

```
Saldo Esperado = Saldo Inicial + Entradas - Salidas
```

### Entradas (por fondo):
Las entradas a cada fondo son el monto **neto** (descontando el interés de plataforma):

```
entrada_neta_por_pago = monto_pago - (interes_venta × monto_pago / total_venta)
```

El interés se distribuye proporcionalmente entre los pagos de cada venta.

### Salidas:
Los gastos (`expenses`) se restan del fondo correspondiente según su método de pago.

### Saldo Inicial:
Se registra manualmente en `cash_opening_balances` por fecha y fondo.

---

## 6. Gastos

### Tabla `expenses`
```
- date: fecha del gasto
- amount: monto
- payment_method: método de pago usado
- fund: "EFECTIVO" | "MERCADOPAGO" (derivado del método)
- category: categoría del gasto
- is_pass_through: boolean - si es true, NO se cuenta como gasto operativo
```

### Gasto Pass-Through
Los gastos marcados como `is_pass_through = true` (ej: "Rendición restaurante") son transferencias internas que NO afectan el cálculo de ganancia, pero SÍ afectan el saldo del fondo.

---

## 7. Sector Restaurante

Los ítems de comida (`owner = "RESTAURANTE"`) se trackean por separado:

- **subtotal_restaurant**: total vendido en comida por venta
- No se les calcula COGS (no tienen cost_price)
- Se reportan aparte: total facturado, cantidad de tickets, unidades vendidas
- Se pueden agrupar por día, mes o año

---

## 8. Impacto en Stock

Solo los productos con `owner = "LOCAL"` y `track_stock = true` afectan inventario:
- Al completar una venta se crea un `stock_movement` tipo "SALE"
- Se descuenta la cantidad del `stock_balance`
- Se verifica stock disponible ANTES de confirmar la venta

---

## 9. Vista Unificada de Movimientos

La vista `v_finance_movements` normaliza ventas y gastos en un formato común para auditoría:

```
- direction: "IN" (venta) | "OUT" (gasto)
- amount_local: monto de la venta atribuido a productos locales
- amount_restaurant: monto atribuido al restaurante
- fund: a qué fondo afecta
- payment_method: método de pago
- is_pass_through: si es transferencia interna
```

---

## 10. Tablas Involucradas

| Tabla | Propósito |
|-------|-----------|
| `pos_sales` | Cabecera de ventas |
| `pos_sale_items` | Líneas de venta con snapshots |
| `pos_payments` | Pagos por venta |
| `expenses` | Gastos operativos |
| `cash_opening_balances` | Saldos iniciales por fondo |
| `price_settings` | % de recargo globales (débito, crédito) |
| `product_prices` | Precios por producto/canal/término |
| `products` | Catálogo con cost_price |
| `stock_balances` | Stock actual |
| `stock_movements` | Historial de movimientos de stock |
| `v_finance_movements` | Vista unificada para auditoría |

---

## Resumen para Implementación

1. **Configurar porcentajes de recargo** en `price_settings`
2. **Calcular precios derivados** automáticamente desde el BASE
3. **Guardar snapshots** (unit_price_base, cost_price) al crear la venta
4. **Calcular interés** como diferencia entre cobrado y base
5. **Ganancia = Acreditado - COGS - Gastos** (excluyendo pass-through)
6. **Capital por fondo** = Saldo inicial + Entradas netas - Salidas
