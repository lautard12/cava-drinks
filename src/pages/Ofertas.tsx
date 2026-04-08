import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchOffers,
  fetchOfferWithItems,
  createOffer,
  updateOffer,
  toggleOffer,
  deleteOffer,
  type Offer,
  type OfferWithItems,
  type OfferFormValues,
} from "@/lib/offer-store";
import { fetchAllProducts } from "@/lib/supabase-store";
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
import { Plus, Pencil, Trash2, Tag, Package, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

export default function Ofertas() {
  const qc = useQueryClient();
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: fetchOffers,
  });
  const { data: allProducts = [] } = useQuery({
    queryKey: ["all-products"],
    queryFn: fetchAllProducts,
  });

  const activeProducts = useMemo(
    () => (allProducts as any[]).filter((p) => p.is_active),
    [allProducts]
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "QUANTITY" | "COMBO">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferWithItems | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"QUANTITY" | "COMBO">("QUANTITY");
  const [offerPrice, setOfferPrice] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [formItems, setFormItems] = useState<{ product_id: string; qty: number }[]>([]);

  const filtered = useMemo(() => {
    let list = offers;
    if (statusFilter === "active") list = list.filter((o) => o.is_active);
    if (statusFilter === "inactive") list = list.filter((o) => !o.is_active);
    if (typeFilter !== "all") list = list.filter((o) => o.type === typeFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(s));
    }
    return list;
  }, [offers, search, statusFilter, typeFilter]);

  const openCreate = () => {
    setEditingOffer(null);
    setName("");
    setType("QUANTITY");
    setOfferPrice(0);
    setIsActive(true);
    setFormItems([{ product_id: "", qty: 2 }]);
    setFormOpen(true);
  };

  const openEdit = async (offer: Offer) => {
    try {
      const full = await fetchOfferWithItems(offer.id);
      setEditingOffer(full);
      setName(full.name);
      setType(full.type as "QUANTITY" | "COMBO");
      setOfferPrice(full.offer_price);
      setIsActive(full.is_active);
      setFormItems(full.items.map((i) => ({ product_id: i.product_id, qty: i.qty })));
      setFormOpen(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleTypeChange = (t: "QUANTITY" | "COMBO") => {
    setType(t);
    if (t === "QUANTITY") {
      setFormItems([{ product_id: formItems[0]?.product_id ?? "", qty: formItems[0]?.qty ?? 2 }]);
    } else if (formItems.length < 2) {
      setFormItems([...formItems, { product_id: "", qty: 1 }]);
    }
  };

  const addComponent = () => {
    if (formItems.length >= 6) return;
    setFormItems([...formItems, { product_id: "", qty: 1 }]);
  };

  const removeComponent = (idx: number) => {
    if (formItems.length <= (type === "COMBO" ? 2 : 1)) return;
    setFormItems(formItems.filter((_, i) => i !== idx));
  };

  const updateComponent = (idx: number, field: "product_id" | "qty", value: string | number) => {
    setFormItems(formItems.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  // Compute reference total for warning
  const referenceTotal = useMemo(() => {
    // For each component, find its cheapest price (RESTAURANTE_BASE)
    let total = 0;
    for (const fi of formItems) {
      if (!fi.product_id) continue;
      const prod = activeProducts.find((p: any) => p.id === fi.product_id);
      if (prod) total += ((prod as any).cost_price ?? 0) * fi.qty;
    }
    return total;
  }, [formItems, activeProducts]);

  const hasDuplicateProducts = useMemo(() => {
    const ids = formItems.map((i) => i.product_id).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }, [formItems]);

  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (offerPrice <= 0) return false;
    if (formItems.some((i) => !i.product_id || i.qty < 1)) return false;
    if (type === "QUANTITY" && formItems.length !== 1) return false;
    if (type === "QUANTITY" && formItems[0]?.qty < 2) return false;
    if (type === "COMBO" && formItems.length < 2) return false;
    if (hasDuplicateProducts) return false;
    return true;
  }, [name, offerPrice, formItems, type, hasDuplicateProducts]);

  const handleSave = async () => {
    if (!isValid) return;
    const values: OfferFormValues = {
      name: name.trim(),
      type,
      offer_price: offerPrice,
      is_active: isActive,
      items: formItems,
    };
    try {
      if (editingOffer) {
        await updateOffer(editingOffer.id, values);
        toast({ title: "Oferta actualizada" });
      } else {
        await createOffer(values);
        toast({ title: "Oferta creada" });
      }
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["pos-active-offers"] });
      setFormOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (o: Offer) => {
    try {
      await toggleOffer(o.id, o.is_active);
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["pos-active-offers"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (o: Offer) => {
    if (!confirm(`¿Eliminar oferta "${o.name}"?`)) return;
    try {
      await deleteOffer(o.id);
      qc.invalidateQueries({ queryKey: ["offers"] });
      qc.invalidateQueries({ queryKey: ["pos-active-offers"] });
      toast({ title: "Oferta eliminada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando ofertas...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="h-6 w-6" /> Ofertas
        </h2>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Nueva Oferta
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Input
          placeholder="Buscar oferta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="inactive">Inactivas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="QUANTITY">Cantidad</SelectItem>
            <SelectItem value="COMBO">Combo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Precio</TableHead>
            <TableHead className="text-center">Activa</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No se encontraron ofertas
              </TableCell>
            </TableRow>
          )}
          {filtered.map((o) => (
            <TableRow key={o.id} className={!o.is_active ? "opacity-50" : ""}>
              <TableCell className="font-medium">{o.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className={o.type === "COMBO" ? "bg-violet-100 text-violet-800 border-violet-200" : "bg-sky-100 text-sky-800 border-sky-200"}>
                  {o.type === "COMBO" ? "Combo" : "Cantidad"}
                </Badge>
              </TableCell>
              <TableCell className="font-semibold">{fmt(o.offer_price)}</TableCell>
              <TableCell className="text-center">
                <Switch checked={o.is_active} onCheckedChange={() => handleToggle(o)} />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(o)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(o)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ─── Form Dialog ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOffer ? "Editar Oferta" : "Nueva Oferta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2 Coca 500ml" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v: any) => handleTypeChange(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUANTITY">Cantidad (un solo producto)</SelectItem>
                    <SelectItem value="COMBO">Combo (varios productos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Precio promocional</Label>
                <Input
                  type="number"
                  value={offerPrice || ""}
                  onChange={(e) => setOfferPrice(parseInt(e.target.value) || 0)}
                  placeholder="3000"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="offer-active" />
              <Label htmlFor="offer-active">Activa</Label>
            </div>

            {/* Components */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Componentes</Label>
                {type === "COMBO" && formItems.length < 6 && (
                  <Button size="sm" variant="outline" onClick={addComponent}>
                    <Plus className="h-3 w-3 mr-1" /> Agregar
                  </Button>
                )}
              </div>

              {formItems.map((fi, idx) => (
                <div key={idx} className="flex gap-2 items-end border rounded-md p-2 bg-muted/30">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Producto</Label>
                    <Select value={fi.product_id} onValueChange={(v) => updateComponent(idx, "product_id", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProducts.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              <Package className="h-3 w-3 text-muted-foreground" />
                              {p.name} {p.variant_label && <span className="text-muted-foreground">{p.variant_label}</span>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Cant.</Label>
                    <Input
                      type="number"
                      min={type === "QUANTITY" ? 2 : 1}
                      value={fi.qty}
                      onChange={(e) => updateComponent(idx, "qty", parseInt(e.target.value) || 1)}
                      className="h-9"
                    />
                  </div>
                  {type === "COMBO" && formItems.length > 2 && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => removeComponent(idx)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}

              {hasDuplicateProducts && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> No se puede repetir el mismo producto
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!isValid}>
              {editingOffer ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
