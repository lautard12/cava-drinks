import { Product, StockBalance, StockMovement } from './types';

export const seedProducts: Product[] = [
  // BEBIDAS
  { id: '1', name: 'Coca-Cola', type: 'BEBIDAS', category: 'Gaseosas', variant_label: '500ml', sku: 'BEB-CC-500', track_stock: true, min_stock: 10, is_active: true, created_at: '2024-01-01' },
  { id: '2', name: 'Coca-Cola', type: 'BEBIDAS', category: 'Gaseosas', variant_label: '1.5L', sku: 'BEB-CC-1500', track_stock: true, min_stock: 6, is_active: true, created_at: '2024-01-01' },
  { id: '3', name: 'Sprite', type: 'BEBIDAS', category: 'Gaseosas', variant_label: '500ml', sku: 'BEB-SP-500', track_stock: true, min_stock: 8, is_active: true, created_at: '2024-01-01' },
  { id: '4', name: 'Agua Mineral', type: 'BEBIDAS', category: 'Aguas', variant_label: '500ml', sku: 'BEB-AG-500', track_stock: true, min_stock: 12, is_active: true, created_at: '2024-01-01' },
  { id: '5', name: 'Cerveza Quilmes', type: 'BEBIDAS', category: 'Cervezas', variant_label: '473ml', sku: 'BEB-QU-473', track_stock: true, min_stock: 15, is_active: true, created_at: '2024-01-01' },
  { id: '6', name: 'Fernet Branca', type: 'BEBIDAS', category: 'Bebidas Alcohólicas', variant_label: '750ml', sku: 'BEB-FB-750', track_stock: true, min_stock: 3, is_active: true, created_at: '2024-01-01' },
  // SNACKS
  { id: '7', name: 'Lays Clásicas', type: 'SNACKS', category: 'Papas', variant_label: 'Grande', sku: 'SNK-LAY-G', track_stock: true, min_stock: 5, is_active: true, created_at: '2024-01-01' },
  { id: '8', name: 'Lays Clásicas', type: 'SNACKS', category: 'Papas', variant_label: 'Chica', sku: 'SNK-LAY-CH', track_stock: true, min_stock: 10, is_active: true, created_at: '2024-01-01' },
  { id: '9', name: 'Doritos', type: 'SNACKS', category: 'Papas', variant_label: 'Grande', sku: 'SNK-DOR-G', track_stock: true, min_stock: 5, is_active: true, created_at: '2024-01-01' },
  { id: '10', name: 'Oreo', type: 'SNACKS', category: 'Galletitas', variant_label: 'Regular', sku: 'SNK-ORE-R', track_stock: true, min_stock: 8, is_active: true, created_at: '2024-01-01' },
  { id: '11', name: 'Alfajor Havanna', type: 'SNACKS', category: 'Alfajores', variant_label: 'Chocolate', sku: 'SNK-HAV-CH', track_stock: true, min_stock: 10, is_active: true, created_at: '2024-01-01' },
  // CIGARRILLOS
  { id: '12', name: 'Marlboro', type: 'CIGARRILLOS', category: 'Marlboro', variant_label: 'Box 20', sku: 'CIG-MAR-B20', track_stock: true, min_stock: 5, is_active: true, created_at: '2024-01-01' },
  { id: '13', name: 'Marlboro', type: 'CIGARRILLOS', category: 'Marlboro', variant_label: 'Gold Box 20', sku: 'CIG-MAR-GB20', track_stock: true, min_stock: 5, is_active: true, created_at: '2024-01-01' },
  { id: '14', name: 'Camel', type: 'CIGARRILLOS', category: 'Camel', variant_label: 'Box 20', sku: 'CIG-CAM-B20', track_stock: true, min_stock: 3, is_active: true, created_at: '2024-01-01' },
  { id: '15', name: 'Lucky Strike', type: 'CIGARRILLOS', category: 'Lucky Strike', variant_label: 'Box 20', sku: 'CIG-LS-B20', track_stock: true, min_stock: 3, is_active: true, created_at: '2024-01-01' },
];

export const seedBalances: StockBalance[] = [
  { product_id: '1', qty_on_hand: 24 },
  { product_id: '2', qty_on_hand: 8 },
  { product_id: '3', qty_on_hand: 3 },  // bajo
  { product_id: '4', qty_on_hand: 0 },  // sin stock
  { product_id: '5', qty_on_hand: 20 },
  { product_id: '6', qty_on_hand: 2 },  // bajo
  { product_id: '7', qty_on_hand: 6 },
  { product_id: '8', qty_on_hand: 0 },  // sin stock
  { product_id: '9', qty_on_hand: 4 },  // bajo
  { product_id: '10', qty_on_hand: 12 },
  { product_id: '11', qty_on_hand: 2 },  // bajo
  { product_id: '12', qty_on_hand: 10 },
  { product_id: '13', qty_on_hand: 1 },  // bajo
  { product_id: '14', qty_on_hand: 0 },  // sin stock
  { product_id: '15', qty_on_hand: 5 },
];

export const seedMovements: StockMovement[] = [
  { id: 'm1', product_id: '1', type: 'PURCHASE', qty: 24, reason: 'Compra semanal', created_at: '2024-01-15T10:00:00', created_by: 'admin' },
  { id: 'm2', product_id: '4', type: 'WASTE', qty: 2, reason: 'Botellas rotas', created_at: '2024-01-16T14:30:00', created_by: 'admin' },
  { id: 'm3', product_id: '8', type: 'SALE', qty: 5, reason: 'Venta mostrador', created_at: '2024-01-16T15:00:00', created_by: 'admin' },
  { id: 'm4', product_id: '12', type: 'PURCHASE', qty: 10, reason: 'Reposición', created_at: '2024-01-17T09:00:00', created_by: 'admin' },
  { id: 'm5', product_id: '3', type: 'ADJUST', qty: -2, reason: 'Ajuste de inventario', created_at: '2024-01-17T11:00:00', created_by: 'admin' },
];
