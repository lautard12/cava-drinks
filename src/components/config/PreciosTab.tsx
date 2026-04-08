import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/config/TablePagination";
import { fetchPriceTerms, createPriceTerm, updatePriceTerm, type PriceTerm } from "@/lib/config-store";
import { recalculateAllPrices } from "@/lib/price-store";

export function PreciosTab() {
  const qc = useQueryClient();
  const { data: terms = [] } = useQuery({ queryKey: ["cfg-price-terms"], queryFn: fetchPriceTerms });
  const { page, totalPages, paged, setPage, total } = usePagination(terms, 10);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "", label: "", surcharge_pct: 0,
    default_installments: "" as string, fund: "EFECTIVO", sort_order: 0,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.toUpperCase().replace(/\s+/g, "_"),
        label: form.label,
        surcharge_pct: Math.max(-50, Math.min(200, form.surcharge_pct)),
        default_installments: form.default_installments ? parseInt(form.default_installments) : null,
        fund: form.fund,
        sort_order: form.sort_order,
      };
      if (editId) await updatePriceTerm(editId, payload);
      else await createPriceTerm(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-price-terms"] });
      toast.success(editId ? "Opción actualizada" : "Opción creada");
      setOpen(false);
    },
    onError: () => toast.error("Error al guardar"),
  });

  const toggleMut = useMutation({
    mutationFn: (t: PriceTerm) => updatePriceTerm(t.id, { is_active: !t.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfg-price-terms"] }),
  });

  const [recalcing, setRecalcing] = useState(false);
  const handleRecalc = async () => {
    setRecalcing(true);
    try {
      await recalculateAllPrices();
      toast.success("Precios recalculados para todos los productos");
    } catch {
      toast.error("Error al recalcular");
    } finally {
      setRecalcing(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ code: "", label: "", surcharge_pct: 0, default_installments: "", fund: "EFECTIVO", sort_order: 0 });
    setOpen(true);
  };
  const openEdit = (t: PriceTerm) => {
    setEditId(t.id);
    setForm({
      code: t.code, label: t.label, surcharge_pct: t.surcharge_pct,
      default_installments: t.default_installments?.toString() ?? "",
      fund: t.fund, sort_order: t.sort_order,
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">Opciones de cobro</CardTitle>
          <CardDescription className="text-xs mt-1">
            Cada opción define un método de pago con su recargo y fondo de destino
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRecalc} disabled={recalcing}>
            <RefreshCcw className={`h-4 w-4 mr-1 ${recalcing ? "animate-spin" : ""}`} />
            Recalcular precios
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />Nueva
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead className="text-right">Recargo %</TableHead>
              <TableHead className="text-center">Cuotas</TableHead>
              <TableHead>Fondo</TableHead>
              <TableHead className="text-center">Orden</TableHead>
              <TableHead className="w-20 text-center">Activo</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((t) => (
              <TableRow key={t.id} className={!t.is_active ? "opacity-50" : ""}>
                <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.code}</code></TableCell>
                <TableCell className="font-medium">{t.label}</TableCell>
                <TableCell className="text-right">{t.surcharge_pct}%</TableCell>
                <TableCell className="text-center">{t.default_installments ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{t.fund}</TableCell>
                <TableCell className="text-center">{t.sort_order}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={t.is_active} onCheckedChange={() => toggleMut.mutate(t)} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {paged.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin opciones</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editId ? "Editar opción" : "Nueva opción de cobro"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Código</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ej: CREDITO_3" className="font-mono" />
              </div>
              <div>
                <Label>Etiqueta</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Ej: Crédito 3 cuotas" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Recargo %</Label>
                  <Input type="number" value={form.surcharge_pct}
                    onChange={(e) => setForm({ ...form, surcharge_pct: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Cuotas (opcional)</Label>
                  <Input type="number" value={form.default_installments}
                    onChange={(e) => setForm({ ...form, default_installments: e.target.value })}
                    placeholder="—" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fondo destino</Label>
                  <Select value={form.fund} onValueChange={(v) => setForm({ ...form, fund: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EFECTIVO">EFECTIVO</SelectItem>
                      <SelectItem value="MERCADOPAGO">MERCADOPAGO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Orden</Label>
                  <Input type="number" value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!form.code.trim() || !form.label.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                {editId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
