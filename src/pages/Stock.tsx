import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProductsWithStock, fetchMovements, addMovement, fetchCategories } from "@/lib/supabase-store";
import { ProductType, MovementType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { History, Plus, Minus, SlidersHorizontal, Package, CalendarCheck } from "lucide-react";
import { StockActionModal } from "@/components/stock/StockActionModal";
import { HistoryDrawer } from "@/components/stock/HistoryDrawer";

import { WeeklyCountMode } from "@/components/stock/WeeklyCountMode";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const typeBadgeStyles: Record<ProductType, string> = {
  BEBIDAS: 'bg-sky-100 text-sky-800 border-sky-200',
  SNACKS: 'bg-orange-100 text-orange-800 border-orange-200',
  CIGARRILLOS: 'bg-violet-100 text-violet-800 border-violet-200',
};

const statusBadge: Record<string, { label: string; className: string }> = {
  sin_stock: { label: 'Sin Stock', className: 'bg-red-100 text-red-800 border-red-200' },
  bajo: { label: 'Bajo', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  ok: { label: 'OK', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

const statusOrder: Record<string, number> = { sin_stock: 0, bajo: 1, ok: 2 };

export default function Stock() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const queryClient = useQueryClient();
  const [stockMode, setStockMode] = useState<'inventario' | 'conteo-semanal'>('inventario');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-with-stock"],
    queryFn: fetchProductsWithStock,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: fetchMovements,
  });

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [onlyLow, setOnlyLow] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  
  const [actionProduct, setActionProduct] = useState<any>(null);
  const [actionType, setActionType] = useState<'PURCHASE' | 'WASTE' | 'ADJUST' | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const filterProducts = (type?: ProductType) => {
    return products
      .filter((p: any) => !type || p.type === type)
      .filter((p: any) => {
        if (search) {
          const term = search.toLowerCase();
          if (!p.name.toLowerCase().includes(term) && !p.variant_label.toLowerCase().includes(term)) return false;
        }
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (onlyLow && p.status === 'ok') return false;
        return true;
      })
      .sort((a: any, b: any) => statusOrder[a.status] - statusOrder[b.status]);
  };

  const handleMovement = async (productId: string, type: MovementType, qty: number, reason: string) => {
    const result = await addMovement(productId, type, qty, reason);
    if (result.error) return result;
    queryClient.invalidateQueries({ queryKey: ["products-with-stock"] });
    queryClient.invalidateQueries({ queryKey: ["movements"] });
    toast({ title: "Movimiento registrado" });
    return result;
  };


  const renderTable = (items: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead className="text-center">Stock</TableHead>
          <TableHead className="text-center">Mín.</TableHead>
          <TableHead>Estado</TableHead>
          {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground py-8">
              No se encontraron productos
            </TableCell>
          </TableRow>
        )}
        {items.map((p: any) => {
          const sb = statusBadge[p.status] || statusBadge.ok;
          return (
            <TableRow key={p.id}>
              <TableCell>
                <span className="font-medium">{p.name}</span>{' '}
                <span className="text-muted-foreground text-sm">{p.variant_label}</span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={typeBadgeStyles[p.type as ProductType]}>{p.type}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
              <TableCell className="text-center font-mono font-semibold">{p.qty_on_hand}</TableCell>
              <TableCell className="text-center text-muted-foreground">{p.min_stock}</TableCell>
              <TableCell>
                <Badge variant="outline" className={sb.className}>{sb.label}</Badge>
              </TableCell>
              {isAdmin && (
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setActionProduct(p); setActionType('PURCHASE'); }}>
                    <Plus className="h-3 w-3 mr-1" />Compra
                  </Button>
                </div>
              </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Cargando inventario...</div>;
  }


  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Stock</h2>
        {isAdmin && (
        <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
          <button
            onClick={() => setStockMode('inventario')}
            className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all", stockMode === 'inventario' ? 'bg-background text-foreground shadow-sm' : '')}
          >
            <Package className="mr-2 h-4 w-4" /> Inventario
          </button>
          <button
            onClick={() => setStockMode('conteo-semanal')}
            className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all", stockMode === 'conteo-semanal' ? 'bg-background text-foreground shadow-sm' : '')}
          >
            <CalendarCheck className="mr-2 h-4 w-4" /> Conteo semanal
          </button>
        </div>
        )}
      </div>

      {isAdmin && stockMode === 'conteo-semanal' ? (
        <WeeklyCountMode />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="low-stock" checked={onlyLow} onCheckedChange={setOnlyLow} />
              <Label htmlFor="low-stock" className="text-sm cursor-pointer">Solo bajos</Label>
            </div>
            {isAdmin && (
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="mr-2 h-4 w-4" /> Historial
              </Button>
            </div>
            )}
          </div>

          {renderTable(filterProducts())}
        </>
      )}

      <StockActionModal
        product={actionProduct}
        action={actionType}
        open={!!actionProduct && !!actionType}
        onClose={() => { setActionProduct(null); setActionType(null); }}
        onSubmit={handleMovement}
      />
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} movements={movements} />
    </div>
  );
}
