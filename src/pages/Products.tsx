import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllProducts, addProduct, updateProduct, toggleProduct, duplicateProduct, deleteProduct, fetchCategories, addCategory, fetchProductTypes, addProductType, type ProductTypeRecord } from "@/lib/supabase-store";
import { fetchPriceCompleteness } from "@/lib/price-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Copy, Pencil, DollarSign, Settings, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import PriceDrawer from "@/components/product/PriceDrawer";
import CreditSettings from "@/components/product/CreditSettings";

const TYPE_COLORS = [
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
];

function getTypeBadgeStyle(typeName: string, allTypes: ProductTypeRecord[]) {
  const idx = allTypes.findIndex(t => t.name === typeName);
  return TYPE_COLORS[idx % TYPE_COLORS.length];
}

function generateSku(prefix: string, name: string, variant: string, unit: string) {
  const namePart = name.trim().substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
  const variantPart = variant.trim().replace(/[^0-9]/g, '') || '0';
  return `${prefix}-${namePart}-${variantPart}${unit}`;
}

export default function Products() {
  const queryClient = useQueryClient();
  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ["all-products"],
    queryFn: fetchAllProducts,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const { data: productTypes = [] } = useQuery<ProductTypeRecord[]>({
    queryKey: ["product-types"],
    queryFn: fetchProductTypes,
  });

  const { data: priceCompleteness = {} } = useQuery({
    queryKey: ["price-completeness"],
    queryFn: fetchPriceCompleteness,
  });

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const defaultForm = {
    name: '',
    type: productTypes[0]?.name ?? 'BEBIDAS',
    category: '',
    variant_label: '',
    unit: productTypes[0]?.units?.[0] ?? 'ml',
    sku: '',
    min_stock: 5,
    track_stock: true,
    is_active: true,
    cost_price: 0,
  };

  const [form, setForm] = useState(defaultForm);
  const [priceProductId, setPriceProductId] = useState<string | null>(null);
  const [priceProductName, setPriceProductName] = useState("");
  const [creditSettingsOpen, setCreditSettingsOpen] = useState(false);

  // Inline creation state
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePrefix, setNewTypePrefix] = useState("");
  const [newTypeUnits, setNewTypeUnits] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catPopoverOpen, setCatPopoverOpen] = useState(false);

  const currentType = productTypes.find(t => t.name === form.type);
  const currentUnits = currentType?.units ?? ['unidades'];

  const filtered = useMemo(() => {
    return allProducts.filter((p: any) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (search) {
        const term = search.toLowerCase();
        if (!p.name.toLowerCase().includes(term) && !p.variant_label.toLowerCase().includes(term) && !p.sku.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [allProducts, search, categoryFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...defaultForm,
      type: productTypes[0]?.name ?? 'BEBIDAS',
      unit: productTypes[0]?.units?.[0] ?? 'ml',
    });
    setFormOpen(true);
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    const pt = productTypes.find(t => t.name === p.type);
    const unit = pt?.units?.[0] ?? 'ml';
    setForm({ name: p.name, type: p.type, category: p.category, variant_label: p.variant_label, unit, sku: p.sku, min_stock: p.min_stock, track_stock: p.track_stock, is_active: p.is_active, cost_price: p.cost_price ?? 0 });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const prefix = currentType?.sku_prefix ?? 'GEN';
    const autoSku = generateSku(prefix, form.name, form.variant_label, form.unit);
    const variantWithUnit = form.variant_label ? `${form.variant_label}${form.unit}` : '';
    const payload = { name: form.name, type: form.type, category: form.category, variant_label: variantWithUnit, sku: autoSku, min_stock: form.min_stock, track_stock: form.track_stock, is_active: form.is_active, cost_price: form.cost_price };
    try {
      if (editingId) {
        await updateProduct(editingId, payload);
        toast({ title: "Producto actualizado" });
      } else {
        await addProduct(payload);
        toast({ title: "Producto creado" });
      }
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-stock"] });
      setFormOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (p: any) => {
    try {
      await duplicateProduct(p.id);
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast({ title: "Producto duplicado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteProduct(p.id);
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-stock"] });
      queryClient.invalidateQueries({ queryKey: ["price-completeness"] });
      toast({ title: "Producto eliminado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (p: any) => {
    try {
      await toggleProduct(p.id, p.is_active);
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-stock"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'type') {
        const pt = productTypes.find(t => t.name === value);
        next.unit = pt?.units?.[0] ?? 'unidades';
      }
      return next;
    });
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    const prefix = newTypePrefix.trim().toUpperCase() || newTypeName.trim().substring(0, 3).toUpperCase();
    const units = newTypeUnits.trim() ? newTypeUnits.split(",").map(u => u.trim()).filter(Boolean) : ["unidades"];
    try {
      const created = await addProductType(newTypeName.trim(), prefix, units);
      queryClient.invalidateQueries({ queryKey: ["product-types"] });
      updateField("type", created.name);
      setNewTypeName("");
      setNewTypePrefix("");
      setNewTypeUnits("");
      setTypePopoverOpen(false);
      toast({ title: `Tipo "${created.name}" creado` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const created = await addCategory(newCatName.trim());
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      updateField("category", created.name);
      setNewCatName("");
      setCatPopoverOpen(false);
      toast({ title: `Categoría "${created.name}" creada` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Cargando productos...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Productos</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreditSettingsOpen(true)}><Settings className="mr-2 h-4 w-4" /> Crédito</Button>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Nuevo Producto</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Input placeholder="Buscar producto, variante o SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Variante</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-center">Precios</TableHead>
            <TableHead className="text-center">Mín.</TableHead>
            <TableHead className="text-center">Activo</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No se encontraron productos</TableCell></TableRow>
          )}
          {filtered.map((p: any) => (
            <TableRow key={p.id} className={!p.is_active ? 'opacity-50' : ''}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell><Badge variant="outline" className={getTypeBadgeStyle(p.type, productTypes)}>{p.type}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
              <TableCell className="text-sm">{p.variant_label}</TableCell>
              <TableCell className="text-xs font-mono text-muted-foreground">{p.sku}</TableCell>
              <TableCell className="text-center">
                <Badge variant={priceCompleteness[p.id] >= 2 ? "default" : "outline"} className="text-xs">
                  {priceCompleteness[p.id] ?? 0}
                </Badge>
              </TableCell>
              <TableCell className="text-center">{p.min_stock}</TableCell>
              <TableCell className="text-center"><Switch checked={p.is_active} onCheckedChange={() => handleToggle(p)} /></TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setPriceProductId(p.id); setPriceProductName(p.name); }}><DollarSign className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => handleDuplicate(p)}><Copy className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(p)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ─── Product Form Dialog ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Coca-Cola" /></div>
            <div className="grid grid-cols-2 gap-4">
              {/* Type with inline creation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tipo</Label>
                  <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="text-xs text-primary hover:underline flex items-center gap-0.5">
                        <Plus className="h-3 w-3" /> Nuevo
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 space-y-3" align="end">
                      <p className="text-sm font-medium">Crear tipo</p>
                      <div className="space-y-2">
                        <Input placeholder="Nombre (ej: Golosinas)" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} className="h-8 text-sm" />
                        <Input placeholder="Prefijo SKU (ej: GOL)" value={newTypePrefix} onChange={(e) => setNewTypePrefix(e.target.value)} className="h-8 text-sm" />
                        <Input placeholder="Unidades: g,kg" value={newTypeUnits} onChange={(e) => setNewTypeUnits(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <Button size="sm" className="w-full" onClick={handleAddType} disabled={!newTypeName.trim()}>Crear</Button>
                    </PopoverContent>
                  </Popover>
                </div>
                <Select value={form.type} onValueChange={(v) => updateField('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {productTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category with inline creation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Categoría</Label>
                  <Popover open={catPopoverOpen} onOpenChange={setCatPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className="text-xs text-primary hover:underline flex items-center gap-0.5">
                        <Plus className="h-3 w-3" /> Nueva
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 space-y-3" align="end">
                      <p className="text-sm font-medium">Crear categoría</p>
                      <Input placeholder="Nombre (ej: Vinos)" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="h-8 text-sm" />
                      <Button size="sm" className="w-full" onClick={handleAddCategory} disabled={!newCatName.trim()}>Crear</Button>
                    </PopoverContent>
                  </Popover>
                </div>
                <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-1"><Label>Cantidad</Label><Input value={form.variant_label} onChange={(e) => updateField('variant_label', e.target.value)} placeholder="500" /></div>
              <div className="space-y-2 col-span-1">
                <Label>Medida</Label>
                <Select value={form.unit} onValueChange={(v) => updateField('unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currentUnits.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-1">
                <Label>SKU</Label>
                <Input value={generateSku(currentType?.sku_prefix ?? 'GEN', form.name, form.variant_label, form.unit)} readOnly className="bg-muted text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Precio de costo</Label><Input type="number" min="0" value={form.cost_price || ''} onChange={(e) => updateField('cost_price', parseInt(e.target.value) || 0)} placeholder="0" /></div>
              <div className="space-y-2"><Label>Stock Mínimo</Label><Input type="number" min="0" value={form.min_stock} onChange={(e) => updateField('min_stock', parseInt(e.target.value) || 0)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? 'Guardar' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PriceDrawer
        open={!!priceProductId}
        onOpenChange={(open) => { if (!open) setPriceProductId(null); }}
        productId={priceProductId}
        productName={priceProductName}
      />

      <CreditSettings open={creditSettingsOpen} onOpenChange={setCreditSettingsOpen} />
    </div>
  );
}
