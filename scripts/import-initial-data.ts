/**
 * Importación inicial de catálogo + stock + precios desde Excel.
 *
 * Uso:
 *   npx tsx scripts/import-initial-data.ts --dry-run   # valida sin escribir
 *   npx tsx scripts/import-initial-data.ts             # ejecuta de verdad
 *
 * Lee:  scripts/data/inventario-inicial.xlsx (hoja "productos")
 * Lee:  scripts/.env.scripts (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 * Escribe en Supabase: products, stock_movements, stock_balances, product_prices
 */

import { createClient } from "@supabase/supabase-js";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const EXCEL_PATH = resolve(ROOT, "scripts/data/inventario-inicial.xlsx");
const SHEET_NAME = "productos";
const ENV_PATH = resolve(ROOT, "scripts/.env.scripts");
const STOCK_INITIAL_REASON = "Carga inicial desde Excel";

const DRY_RUN = process.argv.includes("--dry-run");

type ExcelRow = {
  rowNum: number;
  sku: string;
  name: string;
  type: string;
  category: string;
  variant_label: string;
  min_stock: number;
  track_stock: boolean;
  stock_inicial: number;
  precio_restaurante: number | null;
  precio_delivery: number | null;
};

function loadEnv(): { url: string; key: string } {
  if (!existsSync(ENV_PATH)) {
    fail(
      `No existe ${ENV_PATH}.\n` +
        `Copiá scripts/.env.scripts.example a scripts/.env.scripts y pegá los valores reales.`,
    );
  }
  const raw = readFileSync(ENV_PATH, "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    env[k] = v;
  }
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || url.includes("xxxxxxxxx")) fail("SUPABASE_URL no está configurado en scripts/.env.scripts");
  if (!key || key.includes("pegar-aca")) fail("SUPABASE_SERVICE_ROLE_KEY no está configurado en scripts/.env.scripts");
  return { url, key };
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: unknown, fallback = true): boolean {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toUpperCase();
  if (["TRUE", "1", "SI", "SÍ", "YES", "Y", "X"].includes(s)) return true;
  if (["FALSE", "0", "NO", "N"].includes(s)) return false;
  return fallback;
}

function readExcel(): ExcelRow[] {
  if (!existsSync(EXCEL_PATH)) {
    fail(`No existe ${EXCEL_PATH}.\nGuardá el Excel ahí (con la hoja "${SHEET_NAME}").`);
  }
  const buf = readFileSync(EXCEL_PATH);
  const wb = xlsxRead(buf, { type: "buffer" });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) fail(`El Excel no tiene una hoja llamada "${SHEET_NAME}". Hojas disponibles: ${wb.SheetNames.join(", ")}`);

  const json = xlsxUtils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows: ExcelRow[] = [];
  json.forEach((r, i) => {
    const sku = asString(r.sku);
    const name = asString(r.name);
    if (!sku && !name) return;
    rows.push({
      rowNum: i + 2,
      sku,
      name,
      type: asString(r.type),
      category: asString(r.category),
      variant_label: asString(r.variant_label),
      min_stock: asNumber(r.min_stock, 0),
      track_stock: asBool(r.track_stock, true),
      stock_inicial: asNumber(r.stock_inicial, 0),
      precio_restaurante: asNullableNumber(r.precio_restaurante),
      precio_delivery: asNullableNumber(r.precio_delivery),
    });
  });
  return rows;
}

function validateRows(rows: ExcelRow[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.sku) errors.push(`Fila ${r.rowNum}: falta sku`);
    if (!r.name) errors.push(`Fila ${r.rowNum}: falta name`);
    if (!r.type) errors.push(`Fila ${r.rowNum}: falta type`);
    if (!r.category) errors.push(`Fila ${r.rowNum}: falta category`);
    if (r.stock_inicial < 0) errors.push(`Fila ${r.rowNum}: stock_inicial no puede ser negativo`);
    if (r.precio_restaurante !== null && r.precio_restaurante < 0)
      errors.push(`Fila ${r.rowNum}: precio_restaurante no puede ser negativo`);
    if (r.precio_delivery !== null && r.precio_delivery < 0)
      errors.push(`Fila ${r.rowNum}: precio_delivery no puede ser negativo`);
    if (r.sku) {
      const key = r.sku.toUpperCase();
      if (seen.has(key)) errors.push(`Fila ${r.rowNum}: sku duplicado en el Excel: ${r.sku}`);
      seen.add(key);
    }
  }
  return errors;
}

async function main() {
  console.log(`\n🚀 Importación inicial de inventario — ${DRY_RUN ? "DRY-RUN (no escribe)" : "MODO REAL"}\n`);

  const { url, key } = loadEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`📂 Leyendo Excel: ${EXCEL_PATH}`);
  const rows = readExcel();
  console.log(`   Filas detectadas: ${rows.length}\n`);

  const formatErrors = validateRows(rows);
  if (formatErrors.length) {
    console.error(`❌ Errores de formato (${formatErrors.length}):`);
    formatErrors.slice(0, 20).forEach((e) => console.error(`   - ${e}`));
    if (formatErrors.length > 20) console.error(`   ... y ${formatErrors.length - 20} más`);
    process.exit(1);
  }
  console.log(`✓ Validación de formato OK\n`);

  // Validar product_types contra Supabase
  console.log(`🔎 Verificando tipos de producto en Supabase...`);
  const { data: typesData, error: typesErr } = await supabase
    .from("product_types")
    .select("name, is_active");
  if (typesErr) fail(`Error consultando product_types: ${typesErr.message}`);
  const validTypes = new Set((typesData ?? []).filter((t) => t.is_active).map((t) => t.name));
  const requestedTypes = new Set(rows.map((r) => r.type));
  const missingTypes = [...requestedTypes].filter((t) => !validTypes.has(t));
  if (missingTypes.length) {
    console.error(`❌ Faltan tipos de producto en /configuracion:`);
    missingTypes.forEach((t) => console.error(`   - "${t}"`));
    console.error(`\nCreá esos tipos en /configuracion → Catálogo y volvé a correr.`);
    process.exit(1);
  }
  console.log(`✓ Tipos de producto OK (${validTypes.size} activos)\n`);

  // Resolver término ancla
  console.log(`🔎 Buscando término ancla en price_terms...`);
  const { data: termsData, error: termsErr } = await supabase
    .from("price_terms")
    .select("code, label, sort_order, surcharge_pct, is_active")
    .eq("is_active", true)
    .order("sort_order");
  if (termsErr) fail(`Error consultando price_terms: ${termsErr.message}`);
  const anchor = (termsData ?? []).find((t) => t.sort_order === 0 && Number(t.surcharge_pct) === 0);
  if (!anchor) {
    fail(
      `No se encontró un término ancla (sort_order=0, surcharge_pct=0, activo) en price_terms.\n` +
        `Configuralo en /configuracion → Precios y Cobros antes de importar precios.`,
    );
  }
  console.log(`✓ Término ancla: "${anchor.code}" (${anchor.label})\n`);

  // Traer SKUs existentes
  console.log(`🔎 Cargando productos existentes...`);
  const { data: existing, error: existErr } = await supabase
    .from("products")
    .select("id, sku");
  if (existErr) fail(`Error consultando products: ${existErr.message}`);
  const skuToId = new Map<string, string>();
  for (const p of existing ?? []) {
    if (p.sku) skuToId.set(p.sku.toUpperCase(), p.id);
  }
  const newCount = rows.filter((r) => !skuToId.has(r.sku.toUpperCase())).length;
  const updateCount = rows.length - newCount;
  console.log(`   Productos existentes en BD: ${existing?.length ?? 0}`);
  console.log(`   A crear: ${newCount}`);
  console.log(`   A actualizar (sku ya existe): ${updateCount}\n`);

  // Stock movements ya existentes con la razón de carga inicial (para idempotencia)
  console.log(`🔎 Verificando movimientos de carga inicial previos...`);
  const { data: prevMovs, error: prevErr } = await supabase
    .from("stock_movements")
    .select("product_id")
    .eq("reason", STOCK_INITIAL_REASON);
  if (prevErr) fail(`Error consultando stock_movements: ${prevErr.message}`);
  const productsWithInitial = new Set((prevMovs ?? []).map((m) => m.product_id));

  const stockToInsert = rows.filter((r) => r.stock_inicial > 0).length;
  const priceRestCount = rows.filter((r) => r.precio_restaurante !== null).length;
  const priceDelCount = rows.filter((r) => r.precio_delivery !== null).length;

  console.log(`📊 Resumen:`);
  console.log(`   Productos a procesar: ${rows.length}`);
  console.log(`   Movimientos de stock a generar: ${stockToInsert} (se skipean si ya existe carga inicial)`);
  console.log(`   Precios RESTAURANTE a cargar: ${priceRestCount}`);
  console.log(`   Precios DELIVERY a cargar: ${priceDelCount}\n`);

  if (DRY_RUN) {
    console.log(`✅ DRY-RUN completo. No se escribió nada. Si todo se ve bien, corré sin --dry-run.\n`);
    return;
  }

  console.log(`💾 Aplicando cambios en Supabase...\n`);

  let okProducts = 0;
  let okStock = 0;
  let skipStock = 0;
  let okPrices = 0;
  const errors: string[] = [];

  for (const r of rows) {
    try {
      // 1. Upsert product por SKU
      const existingId = skuToId.get(r.sku.toUpperCase());
      let productId: string;

      if (existingId) {
        const { error } = await supabase
          .from("products")
          .update({
            name: r.name,
            type: r.type,
            category: r.category,
            variant_label: r.variant_label,
            min_stock: r.min_stock,
            track_stock: r.track_stock,
            is_active: true,
          })
          .eq("id", existingId);
        if (error) throw new Error(`update product: ${error.message}`);
        productId = existingId;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({
            sku: r.sku,
            name: r.name,
            type: r.type,
            category: r.category,
            variant_label: r.variant_label,
            min_stock: r.min_stock,
            track_stock: r.track_stock,
            is_active: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(`insert product: ${error.message}`);
        productId = data.id;
        skuToId.set(r.sku.toUpperCase(), productId);
      }
      okProducts++;

      // 2. Stock inicial (idempotente: si ya hubo carga inicial para este producto, skipear)
      if (r.stock_inicial > 0) {
        if (productsWithInitial.has(productId)) {
          skipStock++;
        } else {
          const { error: movErr } = await supabase.from("stock_movements").insert({
            product_id: productId,
            type: "ADJUST",
            qty: r.stock_inicial,
            reason: STOCK_INITIAL_REASON,
          });
          if (movErr) throw new Error(`insert stock_movement: ${movErr.message}`);

          const { error: balErr } = await supabase
            .from("stock_balances")
            .upsert({ product_id: productId, qty_on_hand: r.stock_inicial }, { onConflict: "product_id" });
          if (balErr) throw new Error(`upsert stock_balance: ${balErr.message}`);

          productsWithInitial.add(productId);
          okStock++;
        }
      }

      // 3. Precios (upsert manual: buscar por product_id+channel+term y actualizar o insertar)
      for (const p of [
        { channel: "RESTAURANTE", price: r.precio_restaurante },
        { channel: "DELIVERY", price: r.precio_delivery },
      ]) {
        if (p.price === null) continue;
        const { data: existingPrice, error: selErr } = await supabase
          .from("product_prices")
          .select("id")
          .eq("product_id", productId)
          .eq("channel", p.channel)
          .eq("term", anchor.code)
          .maybeSingle();
        if (selErr) throw new Error(`select product_prices: ${selErr.message}`);

        if (existingPrice) {
          const { error } = await supabase
            .from("product_prices")
            .update({ price: p.price })
            .eq("id", existingPrice.id);
          if (error) throw new Error(`update product_prices ${p.channel}: ${error.message}`);
        } else {
          const { error } = await supabase.from("product_prices").insert({
            product_id: productId,
            channel: p.channel,
            term: anchor.code,
            price: p.price,
          });
          if (error) throw new Error(`insert product_prices ${p.channel}: ${error.message}`);
        }
        okPrices++;
      }

      if (okProducts % 20 === 0) console.log(`   ... procesados ${okProducts}/${rows.length}`);
    } catch (err) {
      errors.push(`Fila ${r.rowNum} (${r.sku} - ${r.name}): ${(err as Error).message}`);
    }
  }

  console.log(`\n✅ Importación finalizada:`);
  console.log(`   Productos OK: ${okProducts}/${rows.length}`);
  console.log(`   Movimientos de stock insertados: ${okStock}`);
  console.log(`   Movimientos de stock skipeados (ya existía carga inicial): ${skipStock}`);
  console.log(`   Precios cargados/actualizados: ${okPrices}`);

  if (errors.length) {
    console.error(`\n⚠️  Errores (${errors.length}):`);
    errors.slice(0, 30).forEach((e) => console.error(`   - ${e}`));
    if (errors.length > 30) console.error(`   ... y ${errors.length - 30} más`);
    process.exit(1);
  }
  console.log(`\n🎉 Listo. Verificá en /products, /stock y /movimientos.\n`);
}

main().catch((err) => {
  console.error(`\n💥 Error inesperado:`, err);
  process.exit(1);
});
