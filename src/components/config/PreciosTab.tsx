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
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/config/TablePagination";
import {
  fetchPriceTerms, createPriceTerm, updatePriceTerm, deletePriceTerm,
  type PriceTerm,
} from "@/lib/config-store";
import { recalculateAllPrices, findAnchor, ensureAllProductsHaveTerm } from "@/lib/price-store";

export function PreciosTab() {
  const qc = useQueryClient();
  const { data: terms = [] } = useQuery({ queryKey: ["cfg-price-terms"], queryFn: fetchPriceTerms });
  const { page, totalPages, paged, setPage, total } = usePagination(terms, 10);
  const anchor = findAnchor(terms);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "", label: "", surcharge_pct: 0,
    default_installments: "" as string, fund: "EFECTIVO", sort_order: 0,
  });

  const isFormAnchor = form.sort_order === 0;
  const editingAnchor = editId !== null && anchor?.id === editId;

  const saveMut = useMutation({
    mutationFn: async () => {
      const codeNorm = form.code.toUpperCase().replace(/\s+/g, "_");

      // Validación: ancla = sort_order 0 y surcharge_pct 0.
      if (form.sort_order === 0 && form.surcharge_pct !== 0) {
        throw new Error("El término ancla (orden 0) debe tener recargo 0%.");
      }

      // Validación: no puede haber dos rows con sort_order = 0.
      if (form.sort_order === 0) {
        const existingAnchor = terms.find((t) => t.sort_order === 0);
        if (existingAnchor && existingAnchor.id !== editId) {
          throw new Error(
            `Ya existe un ancla: "${existingAnchor.label}". Cambiá su orden antes de crear otra.`,
          );
        }
      }

      // Validación: si estamos editando el ancla, no se puede dejar de serlo sin reasignar.
      if (editingAnchor && form.sort_order !== 0) {
        throw new Error(
          "No se puede mover el ancla. Primero asigná otro término como ancla (orden 0).",
        );
      }

      const payload = {
        code: codeNorm,
        label: form.label,
        surcharge_pct: Math.max(0, Math.min(200, form.surcharge_pct)),
        default_installments: form.default_installments ? parseInt(form.default_installments) : null,
        fund: form.fund,
        sort_order: form.sort_order,
      };

      if (editId) {
        await updatePriceTerm(editId, payload);
      } else {
        await createPriceTerm(payload);
        // Crear product_prices en 0 para todos los productos.
        await ensureAllProductsHaveTerm(codeNorm);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-price-terms"] });
      qc.invalidateQueries({ queryKey: ["price-terms"] });
      qc.invalidateQueries({ queryKey: ["price-completeness"] });
      toast.success(editId ? "Opción actualizada" : "Opción creada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Error al guardar"),
  });

  const toggleMut = useMutation({
    mutationFn: (t: PriceTerm) => {
      if (t.id === anchor?.id && t.is_active) {
        throw new Error("No se puede desactivar el ancla.");
      }
      return updatePriceTerm(t.id, { is_active: !t.is_active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfg-price-terms"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (t: PriceTerm) => {
      if (t.id === anchor?.id) {
        throw new Error("No se puede borrar el ancla. Asigná otro como ancla primero.");
      }
      await deletePriceTerm(t.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-price-terms"] });
      qc.invalidateQueries({ queryKey: ["price-completeness"] });
      toast.success("Opción eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [recalcing, setRecalcing] = useState(false);
  const handleRecalc = async () => {
    setRecalcing(true);
    try {
      await recalculateAllPrices();
      qc.invalidateQueries({ queryKey: ["price-completeness"] });
      toast.success("Precios recalculados para todos los productos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al recalcular");
    } finally {
      setRecalcing(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    // Si ya existe ancla, sugerir el siguiente sort_order; sino, 0.
    const nextOrder = anchor ? Math.max(0, ...terms.map((t) => t.sort_order)) + 1 : 0;
    setForm({
      code: "", label: "",
      surcharge_pct: 0,
      default_installments: "",
      fund: "EFECTIVO",
      sort_order: nextOrder,
    });
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

  const handleDelete = (t: PriceTerm) => {
    if (!confirm(`¿Eliminar "${t.label}"? Se borrarán los precios asociados a este término.`)) return;
    deleteMut.mutate(t);
  };

  return (
    <div className="space-y-3">
      {!anchor && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
          <div>
            <p className="font-medium text-destructive">No hay un término ancla configurado</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Creá una opción con <strong>orden 0</strong> y <strong>recargo 0%</strong>. Es el precio base del que se derivan los demás.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Opciones de cobro</CardTitle>
            <CardDescription className="text-xs mt-1">
              El término <strong>ancla</strong> (orden 0, recargo 0%) define el precio base. Los demás se calculan como <code>base × (1 + recargo)</code>.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRecalc} disabled={recalcing || !anchor}>
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
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((t) => {
                const isAnchor = anchor?.id === t.id;
                return (
                  <TableRow key={t.id} className={!t.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.code}</code>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {t.label}
                        {isAnchor && (
                          <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                            ANCLA
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{t.surcharge_pct}%</TableCell>
                    <TableCell className="text-center">{t.default_installments ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.fund}</TableCell>
                    <TableCell className="text-center">{t.sort_order}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={() => toggleMut.mutate(t)}
                        disabled={isAnchor}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(t)}
                          disabled={isAnchor}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin opciones</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editId ? "Editar opción" : "Nueva opción de cobro"}
                  {isFormAnchor && (
                    <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                      ANCLA
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
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
                    <Input
                      type="number"
                      value={form.surcharge_pct}
                      disabled={isFormAnchor}
                      onChange={(e) => setForm({ ...form, surcharge_pct: parseFloat(e.target.value) || 0 })}
                    />
                    {isFormAnchor && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        El ancla siempre tiene recargo 0%.
                      </p>
                    )}
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
                    <Input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => {
                        const newOrder = parseInt(e.target.value) || 0;
                        setForm({
                          ...form,
                          sort_order: newOrder,
                          // Si el usuario lo pone en 0, forzamos recargo 0.
                          surcharge_pct: newOrder === 0 ? 0 : form.surcharge_pct,
                        });
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Orden 0 = ancla.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!form.code.trim() || !form.label.trim() || saveMut.isPending}
                  onClick={() => saveMut.mutate()}
                >
                  {editId ? "Guardar" : "Crear"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
