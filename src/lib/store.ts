import { useState, useCallback } from 'react';
import { Product, StockBalance, StockMovement, ProductWithStock, MovementType } from './types';
import { seedProducts, seedBalances, seedMovements } from './seed-data';

// Simple global store (will be replaced by Supabase later)
let products: Product[] = [...seedProducts];
let balances: StockBalance[] = [...seedBalances];
let movements: StockMovement[] = [...seedMovements];
let nextId = 100;

function getNextId() {
  return String(nextId++);
}

export function useStore() {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);

  const getProductsWithStock = useCallback((): ProductWithStock[] => {
    return products.filter(p => p.is_active).map(p => {
      const bal = balances.find(b => b.product_id === p.id);
      const qty = bal?.qty_on_hand ?? 0;
      let status: ProductWithStock['status'] = 'ok';
      if (qty <= 0) status = 'sin_stock';
      else if (qty <= p.min_stock) status = 'bajo';
      return { ...p, qty_on_hand: qty, status };
    });
  }, [version]);

  const getAllProducts = useCallback((): Product[] => {
    return [...products];
  }, [version]);

  const getMovements = useCallback((): (StockMovement & { product?: Product })[] => {
    return movements.map(m => ({
      ...m,
      product: products.find(p => p.id === m.product_id),
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [version]);

  const addMovement = useCallback((productId: string, type: MovementType, qty: number, reason: string) => {
    const bal = balances.find(b => b.product_id === productId);
    const currentQty = bal?.qty_on_hand ?? 0;
    
    let delta = qty;
    if (type === 'WASTE' || type === 'SALE') delta = -Math.abs(qty);
    if (type === 'PURCHASE') delta = Math.abs(qty);
    // ADJUST keeps sign as-is
    
    const newQty = currentQty + delta;
    if (newQty < 0) {
      return { error: `Stock insuficiente. Stock actual: ${currentQty}` };
    }

    const movement: StockMovement = {
      id: getNextId(),
      product_id: productId,
      type,
      qty: delta,
      reason,
      created_at: new Date().toISOString(),
      created_by: 'admin',
    };
    movements.push(movement);

    if (bal) {
      bal.qty_on_hand = newQty;
    } else {
      balances.push({ product_id: productId, qty_on_hand: newQty });
    }

    refresh();
    return { success: true };
  }, [refresh]);

  const addProduct = useCallback((data: Omit<Product, 'id' | 'created_at'>) => {
    const product: Product = {
      ...data,
      id: getNextId(),
      created_at: new Date().toISOString(),
    };
    products.push(product);
    balances.push({ product_id: product.id, qty_on_hand: 0 });
    refresh();
    return product;
  }, [refresh]);

  const updateProduct = useCallback((id: string, data: Partial<Product>) => {
    const idx = products.findIndex(p => p.id === id);
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...data };
      refresh();
    }
  }, [refresh]);

  const toggleProduct = useCallback((id: string) => {
    const idx = products.findIndex(p => p.id === id);
    if (idx >= 0) {
      products[idx].is_active = !products[idx].is_active;
      refresh();
    }
  }, [refresh]);

  const duplicateProduct = useCallback((id: string) => {
    const src = products.find(p => p.id === id);
    if (src) {
      const dup: Product = {
        ...src,
        id: getNextId(),
        variant_label: src.variant_label + ' (copia)',
        sku: src.sku + '-DUP',
        created_at: new Date().toISOString(),
      };
      products.push(dup);
      balances.push({ product_id: dup.id, qty_on_hand: 0 });
      refresh();
      return dup;
    }
  }, [refresh]);

  const applyCount = useCallback((counts: Record<string, number>) => {
    const results: { productId: string; diff: number }[] = [];
    Object.entries(counts).forEach(([productId, realQty]) => {
      const bal = balances.find(b => b.product_id === productId);
      const currentQty = bal?.qty_on_hand ?? 0;
      const diff = realQty - currentQty;
      if (diff !== 0) {
        const movement: StockMovement = {
          id: getNextId(),
          product_id: productId,
          type: 'ADJUST',
          qty: diff,
          reason: `Conteo físico: ${currentQty} → ${realQty}`,
          created_at: new Date().toISOString(),
          created_by: 'admin',
        };
        movements.push(movement);
        if (bal) bal.qty_on_hand = realQty;
        else balances.push({ product_id: productId, qty_on_hand: realQty });
        results.push({ productId, diff });
      }
    });
    refresh();
    return results;
  }, [refresh]);

  return {
    getProductsWithStock,
    getAllProducts,
    getMovements,
    addMovement,
    addProduct,
    updateProduct,
    toggleProduct,
    duplicateProduct,
    applyCount,
    version,
  };
}
