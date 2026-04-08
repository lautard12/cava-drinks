import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Truck, Plus, Trash2, Eye, Package } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { fetchPurchases, fetchPurchaseWithItems, createPurchase, type StockPurchase, type PurchaseItemInput } from "@/lib/purchase-store";
import { fetchSuppliers, createSupplier, type Supplier } from "@/lib/supplier-store";
import { supabase } from "@/integrations/supabase/client";

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;

type DatePreset = "hoy" | "7d" | "mes" | "custom";

interface ProductOption {
  id: string;
  name: string;
  variant_label: string;
  cost_price: number;
}

interface ItemRow {
  product_id: string;
  qty: number;
  unit_cost: number;
}

export default function Compras() {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [showNew, setShowNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showSupplierNew, setShowSupplierNew] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");

  const dateRange = useMemo(() => {
    if (preset === "hoy") return { from: today, to: today };
    if (preset === "7d") return { from: format(subDays(new Date(), 6), "yyyy-MM-dd"), to: today };
    if (preset === "mes") return { from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: today };
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo, today]);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["stock-purchases", dateRange.from, dateRange.to],
    queryFn: () => fetchPurchases(dateRange.from, dateRange.to),
  });

  const { data: detail } = useQuery({
    queryKey: ["stock-purchase-detail", detailId],
    queryFn: () => fetchPurchaseWithItems(detailId!),
    enabled: !!detailId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-for-purchase"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, variant_label, cost_price")
        .eq("is_active", true)
        .eq("track_stock", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductOption[];
    },
  });

  const totalAmount = useMemo(() => purchases.reduce((s, p) => s + p.total_amount, 0), [purchases]);

  // ─── New Purchase Form State ─────────────────────────

  const [formDate, setFormDate] = useState(today);
  const [formFund, setFormFund] = useState("EFECTIVO");
  const [formSupplier, setFormSupplier] = useState<string>("");
  const [formNotes, setFormNotes] = useState("");
  const [formItems, setFormItems] = useState<ItemRow[]>([{ product_id: "", qty: 1, unit_cost: 0 }]);
  const [formUpdateCosts, setFormUpdateCosts] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormDate(today);
    setFormFund("EFECTIVO");
    setFormSupplier("");
    setFormNotes("");
    setFormItems([{ product_id: "", qty: 1, unit_cost: 0 }]);
    setFormUpdateCosts(false);
  };

  const formTotal = useMemo(
    () => formItems.reduce((s, i) => s + i.qty * i.unit_cost, 0),
    [formItems],
  );

  const updateItem = (idx: number, field: keyof ItemRow, value: any) => {
    setFormItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      // Pre-fill cost when selecting product
      if (field === "product_id") {
        const p = products.find((pr) => pr.id === value);
        if (p) copy[idx].unit_cost = p.cost_price;
      }
      return copy;
    });
  };

  const addLine = () => setFormItems((p) => [...p, { product_id: "", qty: 1, unit_cost: 0 }]);
  const removeLine = (idx: number) => setFormItems((p) => p.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const validItems = formItems.filter((i) => i.product_id && i.qty > 0);
    if (validItems.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => s.id === formSupplier);
      await createPurchase({
        purchase_date: formDate,
        supplier_id: formSupplier || null,
        supplier_name_snapshot: supplier?.name ?? "Sin proveedor",
        payment_fund: formFund,
        payment_method: formFund,
        notes: formNotes,
        items: validItems,
        updateCostPrices: formUpdateCosts,
      });
      toast.success("Compra registrada");
      setShowNew(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["stock-purchases"] });
      qc.invalidateQueries({ queryKey: ["products-with-stock"] });
      qc.invalidateQueries({ queryKey: ["products-for-purchase"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNewSupplier = async () => {
    if (!newSupplierName.trim()) return;
    try {
      const s = await createSupplier(newSupplierName.trim());
      toast.success("Proveedor creado");
      setNewSupplierName("");
      setShowSupplierNew(false);
      setFormSupplier(s.id);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-6 w-6" /> Compras de Mercadería
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Registro de compras e ingreso de stock</p>
        </div>
        <Button onClick={() => { resetForm(); setShowNew(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nueva compra
        </Button>
      </div>

      {/* Date presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <ToggleGroup type="single" value={preset} onValueChange={(v) => v && setPreset(v as DatePreset)}>
          <ToggleGroupItem value="hoy" size="sm">Hoy</ToggleGroupItem>
          <ToggleGroupItem value="7d" size="sm">7 días</ToggleGroupItem>
          <ToggleGroupItem value="mes" size="sm">Mes</ToggleGroupItem>
          <ToggleGroupItem value="custom" size="sm">Custom</ToggleGroupItem>
        </ToggleGroup>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-36" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total compras</p>
            <p className="text-2xl font-bold text-foreground">{fmt(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Compras registradas</p>
            <p className="text-2xl font-bold text-foreground">{purchases.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Cargando…</p>
      ) : purchases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No hay compras en este período</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fondo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{format(new Date(p.purchase_date + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{p.supplier_name_snapshot || "Sin proveedor"}</TableCell>
                  <TableCell>{p.payment_fund}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(p.total_amount)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetailId(p.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── New Purchase Dialog ─── */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva compra de mercadería</DialogTitle>
            <DialogDescription>Registrá los productos comprados. Se actualizará el stock automáticamente.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>Fondo de pago</Label>
              <Select value={formFund} onValueChange={setFormFund}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                  <SelectItem value="MERCADOPAGO">Mercado Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Proveedor</Label>
            <div className="flex gap-2">
              <Select value={formSupplier} onValueChange={setFormSupplier}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setShowSupplierNew(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Opcional" rows={2} />
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Productos</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" /> Línea
              </Button>
            </div>

            {formItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_100px_90px_32px] gap-2 items-end">
                <div>
                  {idx === 0 && <Label className="text-xs text-muted-foreground">Producto</Label>}
                  <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Elegir…" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.variant_label ? ` (${p.variant_label})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {idx === 0 && <Label className="text-xs text-muted-foreground">Cant.</Label>}
                  <Input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateItem(idx, "qty", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  {idx === 0 && <Label className="text-xs text-muted-foreground">Costo unit.</Label>}
                  <Input
                    type="number"
                    min={0}
                    value={item.unit_cost}
                    onChange={(e) => updateItem(idx, "unit_cost", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  {idx === 0 && <Label className="text-xs text-muted-foreground">Subtotal</Label>}
                  <p className="h-10 flex items-center text-sm font-medium text-foreground">
                    {fmt(item.qty * item.unit_cost)}
                  </p>
                </div>
                <div>
                  {idx === 0 && <Label className="text-xs text-muted-foreground">&nbsp;</Label>}
                  {formItems.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-10 w-8" onClick={() => removeLine(idx)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="update-costs"
              checked={formUpdateCosts}
              onCheckedChange={(v) => setFormUpdateCosts(!!v)}
            />
            <Label htmlFor="update-costs" className="text-sm">Actualizar costo de productos con estos precios</Label>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <p className="text-lg font-bold text-foreground">Total: {fmt(formTotal)}</p>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Registrar compra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de compra</DialogTitle>
            <DialogDescription>
              {detail && `${format(new Date(detail.purchase_date + "T12:00:00"), "dd/MM/yyyy")} — ${detail.supplier_name_snapshot || "Sin proveedor"}`}
            </DialogDescription>
          </DialogHeader>
          {detail?.items && detail.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.product_name}{it.variant_label ? ` (${it.variant_label})` : ""}</TableCell>
                    <TableCell className="text-right">{it.qty}</TableCell>
                    <TableCell className="text-right">{fmt(it.unit_cost)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(it.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">Cargando…</p>
          )}
          {detail && (
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Fondo: {detail.payment_fund}</span>
              <span className="text-lg font-bold">{fmt(detail.total_amount)}</span>
            </div>
          )}
          {detail?.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}
        </DialogContent>
      </Dialog>

      {/* ─── New Supplier Mini Dialog ─── */}
      <Dialog open={showSupplierNew} onOpenChange={setShowSupplierNew}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo proveedor</DialogTitle>
            <DialogDescription>Agregá un proveedor para asociar a las compras.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Nombre del proveedor"
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewSupplier()}
          />
          <DialogFooter>
            <Button onClick={handleNewSupplier} disabled={!newSupplierName.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
