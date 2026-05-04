import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/config/TablePagination";
import {
  fetchExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  type ExpenseCategory,
} from "@/lib/config-store";

export function GastosTab() {
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery({
    queryKey: ["cfg-expense-categories"],
    queryFn: fetchExpenseCategories,
  });
  const { page, totalPages, paged, setPage, total } = usePagination(cats, 10);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    is_pass_through_default: false,
    sort_order: 0,
  });

  const [toDelete, setToDelete] = useState<ExpenseCategory | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        is_pass_through_default: form.is_pass_through_default,
        sort_order: form.sort_order,
      };
      if (editId) await updateExpenseCategory(editId, payload);
      else await createExpenseCategory(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-expense-categories"] });
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success(editId ? "Categoría actualizada" : "Categoría creada");
      setOpen(false);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("duplicate")) toast.error("Ya existe una categoría con ese nombre");
      else toast.error("Error al guardar");
    },
  });

  const toggleMut = useMutation({
    mutationFn: (c: ExpenseCategory) => updateExpenseCategory(c.id, { is_active: !c.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-expense-categories"] });
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-expense-categories"] });
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("Categoría eliminada");
      setToDelete(null);
    },
    onError: () => toast.error("No se pudo eliminar"),
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ name: "", is_pass_through_default: false, sort_order: 0 });
    setOpen(true);
  };

  const openEdit = (c: ExpenseCategory) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      is_pass_through_default: c.is_pass_through_default,
      sort_order: c.sort_order,
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">Categorías de gasto</CardTitle>
          <CardDescription className="text-xs mt-1">
            Las opciones que aparecen al registrar un gasto. "Pass-through" = no afecta el resultado del local (ej.: rendiciones al restaurante).
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />Nueva
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-center">Pass-through</TableHead>
              <TableHead className="text-center">Orden</TableHead>
              <TableHead className="w-20 text-center">Activa</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((c) => (
              <TableRow key={c.id} className={!c.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-center">
                  {c.is_pass_through_default ? (
                    <Badge variant="secondary">Pass-through</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">{c.sort_order}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={c.is_active} onCheckedChange={() => toggleMut.mutate(c)} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setToDelete(c)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">Sin categorías</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar categoría" : "Nueva categoría de gasto"}</DialogTitle>
              <DialogDescription>
                Las categorías aparecen en el modal de registrar gasto y en los desgloses de Finanzas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Marketing"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="passthrough"
                  checked={form.is_pass_through_default}
                  onCheckedChange={(v) => setForm({ ...form, is_pass_through_default: !!v })}
                />
                <Label htmlFor="passthrough" className="text-sm font-normal cursor-pointer">
                  Es pass-through (no afecta el resultado del local)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground -mt-1 pl-6">
                Activá esto si el gasto es plata que pasa por el local pero no es un gasto operativo (ej.: rendición al restaurante).
              </p>
              <div>
                <Label>Orden</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.name.trim() || saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                {editId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar la categoría "{toDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Los gastos ya registrados con esta categoría NO se modifican (se conserva el nombre snapshoteado). Sólo desaparece del listado al crear nuevos gastos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(ev) => {
                  ev.preventDefault();
                  if (toDelete) deleteMut.mutate(toDelete.id);
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
