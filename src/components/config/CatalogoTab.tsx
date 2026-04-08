import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/config/TablePagination";
import {
  fetchTypes, createType, updateType,
  fetchCategories, createCategory, updateCategory,
  fetchVariantSets, createVariantSet, updateVariantSet,
  fetchVariantValues, createVariantValue, updateVariantValue,
  type ProductType, type ProductCategory, type VariantSet, type VariantValue,
} from "@/lib/config-store";

export function CatalogoTab() {
  return (
    <div className="space-y-6">
      <TypesCard />
      <CategoriesCard />
      <VariantsCard />
    </div>
  );
}

// ─── Types Card ──────────────────────────────────────────

function TypesCard() {
  const qc = useQueryClient();
  const { data: types = [] } = useQuery({ queryKey: ["cfg-types"], queryFn: fetchTypes });
  const { page, totalPages, paged, setPage, total } = usePagination(types);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState<string[]>([]);
  const [newUnit, setNewUnit] = useState("");

  const COMMON_UNITS = ["ml", "L", "g", "kg", "un", "cc", "oz"];

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editId) await updateType(editId, { name, units });
      else await createType(name, units);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-types"] });
      toast.success(editId ? "Tipo actualizado" : "Tipo creado");
      setOpen(false);
    },
    onError: () => toast.error("Error al guardar"),
  });

  const toggleMut = useMutation({
    mutationFn: (t: ProductType) => updateType(t.id, { is_active: !t.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfg-types"] }),
  });

  const openCreate = () => { setEditId(null); setName(""); setUnits([]); setNewUnit(""); setOpen(true); };
  const openEdit = (t: ProductType) => { setEditId(t.id); setName(t.name); setUnits(t.units ?? []); setNewUnit(""); setOpen(true); };

  const addUnit = (u: string) => {
    const trimmed = u.trim().toLowerCase();
    if (trimmed && !units.includes(trimmed)) setUnits([...units, trimmed]);
    setNewUnit("");
  };

  const removeUnit = (u: string) => setUnits(units.filter((x) => x !== u));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Tipos de producto</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nuevo</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Unidades</TableHead>
              <TableHead className="w-20 text-center">Activo</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((t) => (
              <TableRow key={t.id} className={!t.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(t.units ?? []).map((u) => (
                      <Badge key={u} variant="secondary" className="text-xs">{u}</Badge>
                    ))}
                    {(!t.units || t.units.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </TableCell>
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
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin tipos</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editId ? "Editar tipo" : "Nuevo tipo"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Unidades de medida</Label>
                <div className="flex flex-wrap gap-1">
                  {units.map((u) => (
                    <Badge key={u} variant="secondary" className="gap-1 pr-1">
                      {u}
                      <button onClick={() => removeUnit(u)} className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    placeholder="Ej: ml, g, kg..."
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUnit(newUnit); } }}
                    className="h-8"
                  />
                  <Button type="button" size="sm" variant="outline" className="h-8" disabled={!newUnit.trim()} onClick={() => addUnit(newUnit)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {COMMON_UNITS.filter((u) => !units.includes(u)).map((u) => (
                    <Badge key={u} variant="outline" className="cursor-pointer text-xs hover:bg-accent" onClick={() => addUnit(u)}>
                      + {u}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                {editId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Categories Card ─────────────────────────────────────

function CategoriesCard() {
  const qc = useQueryClient();
  const { data: types = [] } = useQuery({ queryKey: ["cfg-types"], queryFn: fetchTypes });
  const { data: categories = [] } = useQuery({ queryKey: ["cfg-categories"], queryFn: fetchCategories });

  const [filterType, setFilterType] = useState<string>("all");
  const filtered = useMemo(() => {
    if (filterType === "all") return categories;
    if (filterType === "none") return categories.filter((c) => !c.type_id);
    return categories.filter((c) => c.type_id === filterType);
  }, [categories, filterType]);

  const { page, totalPages, paged, setPage, total } = usePagination(filtered);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState<string>("none");

  const saveMut = useMutation({
    mutationFn: async () => {
      const tid = typeId === "none" ? null : typeId;
      if (editId) await updateCategory(editId, { name, type_id: tid });
      else await createCategory(name, tid);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-categories"] });
      toast.success(editId ? "Categoría actualizada" : "Categoría creada");
      setOpen(false);
    },
    onError: () => toast.error("Error al guardar"),
  });

  const toggleMut = useMutation({
    mutationFn: (c: ProductCategory) => updateCategory(c.id, { is_active: !c.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfg-categories"] }),
  });

  const openCreate = () => { setEditId(null); setName(""); setTypeId("none"); setOpen(true); };
  const openEdit = (c: ProductCategory) => {
    setEditId(c.id); setName(c.name); setTypeId(c.type_id ?? "none"); setOpen(true);
  };

  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name ?? "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">Categorías</CardTitle>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="none">Sin tipo</SelectItem>
              {types.filter((t) => t.is_active).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nueva</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-20 text-center">Activo</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((c) => (
              <TableRow key={c.id} className={!c.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{typeName(c.type_id)}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={c.is_active} onCheckedChange={() => toggleMut.mutate(c)} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {paged.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin categorías</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editId ? "Editar categoría" : "Nueva categoría"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div>
                <Label>Tipo (opcional)</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin tipo</SelectItem>
                    {types.filter((t) => t.is_active).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                {editId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Variants Card ───────────────────────────────────────

function VariantsCard() {
  const qc = useQueryClient();
  const { data: sets = [] } = useQuery({ queryKey: ["cfg-variant-sets"], queryFn: fetchVariantSets });

  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const { data: values = [] } = useQuery({
    queryKey: ["cfg-variant-values", selectedSet],
    queryFn: () => fetchVariantValues(selectedSet!),
    enabled: !!selectedSet,
  });

  const { page, totalPages, paged, setPage, total } = usePagination(values);

  const [setDialogOpen, setSetDialogOpen] = useState(false);
  const [editSetId, setEditSetId] = useState<string | null>(null);
  const [setName, setSetName] = useState("");

  const [valDialogOpen, setValDialogOpen] = useState(false);
  const [editValId, setEditValId] = useState<string | null>(null);
  const [valText, setValText] = useState("");

  const saveSetMut = useMutation({
    mutationFn: async () => {
      if (editSetId) {
        await updateVariantSet(editSetId, { name: setName });
      } else {
        const newId = await createVariantSet(setName);
        setSelectedSet(newId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-variant-sets"] });
      toast.success(editSetId ? "Set actualizado" : "Set creado");
      setSetDialogOpen(false);
    },
    onError: () => toast.error("Error al guardar"),
  });

  const toggleSetMut = useMutation({
    mutationFn: (s: VariantSet) => updateVariantSet(s.id, { is_active: !s.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfg-variant-sets"] }),
  });

  const saveValMut = useMutation({
    mutationFn: async () => {
      if (editValId) await updateVariantValue(editValId, { value: valText });
      else await createVariantValue(selectedSet!, valText);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cfg-variant-values", selectedSet] });
      toast.success(editValId ? "Valor actualizado" : "Valor creado");
      setValDialogOpen(false);
    },
    onError: () => toast.error("Error al guardar"),
  });

  const toggleValMut = useMutation({
    mutationFn: (v: VariantValue) => updateVariantValue(v.id, { is_active: !v.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cfg-variant-values", selectedSet] }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Sets de variantes</CardTitle>
        <Button size="sm" onClick={() => { setEditSetId(null); setSetName(""); setSetDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />Nuevo set
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Badge selector */}
        <div className="flex flex-wrap gap-2">
          {sets.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <Badge
                variant={selectedSet === s.id ? "default" : "outline"}
                className={`cursor-pointer ${!s.is_active ? "opacity-50" : ""}`}
                onClick={() => setSelectedSet(s.id)}
              >
                {s.name}
              </Badge>
            </div>
          ))}
          {sets.length === 0 && <span className="text-sm text-muted-foreground">No hay sets de variantes</span>}
        </div>

        {/* Selected set actions + values */}
        {selectedSet && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                const s = sets.find((x) => x.id === selectedSet);
                if (s) { setEditSetId(s.id); setSetName(s.name); setSetDialogOpen(true); }
              }}>
                <Pencil className="h-3.5 w-3.5 mr-1" />Editar set
              </Button>
              <Switch
                checked={sets.find((s) => s.id === selectedSet)?.is_active ?? true}
                onCheckedChange={() => {
                  const s = sets.find((x) => x.id === selectedSet);
                  if (s) toggleSetMut.mutate(s);
                }}
              />
              <span className="text-xs text-muted-foreground">Activo</span>
              <div className="flex-1" />
              <Button size="sm" onClick={() => { setEditValId(null); setValText(""); setValDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Agregar valor
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Valor</TableHead>
                  <TableHead className="w-20 text-center">Activo</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((v) => (
                  <TableRow key={v.id} className={!v.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{v.value}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={v.is_active} onCheckedChange={() => toggleValMut.mutate(v)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        setEditValId(v.id); setValText(v.value); setValDialogOpen(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {paged.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin valores</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
          </div>
        )}

        {/* Set Dialog */}
        <Dialog open={setDialogOpen} onOpenChange={setSetDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editSetId ? "Editar set" : "Nuevo set"}</DialogTitle></DialogHeader>
            <div><Label>Nombre</Label><Input value={setName} onChange={(e) => setSetName(e.target.value)} /></div>
            <DialogFooter>
              <Button disabled={!setName.trim() || saveSetMut.isPending} onClick={() => saveSetMut.mutate()}>
                {editSetId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Value Dialog */}
        <Dialog open={valDialogOpen} onOpenChange={setValDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editValId ? "Editar valor" : "Nuevo valor"}</DialogTitle></DialogHeader>
            <div><Label>Valor</Label><Input value={valText} onChange={(e) => setValText(e.target.value)} /></div>
            <DialogFooter>
              <Button disabled={!valText.trim() || saveValMut.isPending} onClick={() => saveValMut.mutate()}>
                {editValId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
