import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRestaurantItems,
  fetchRestaurantCategories,
  addRestaurantItem,
  updateRestaurantItem,
  deleteRestaurantItem,
  duplicateRestaurantItem,
} from "@/lib/restaurant-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Copy, Trash2, Tags, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ItemFormDialog from "@/components/restaurant/ItemFormDialog";
import CategoryManager from "@/components/restaurant/CategoryManager";

export default function RestaurantMenu() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["restaurant-items"],
    queryFn: fetchRestaurantItems,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["restaurant-categories"],
    queryFn: fetchRestaurantCategories,
  });

  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterType, setFilterType] = useState<"all" | "platos" | "ofertas">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [catOpen, setCatOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i: any) => i.name.toLowerCase().includes(q));
    }
    if (filterCat !== "all") {
      list = list.filter((i: any) => i.category_id === filterCat);
    }
    if (filterType === "platos") list = list.filter((i: any) => !i.is_offer);
    if (filterType === "ofertas") list = list.filter((i: any) => i.is_offer);
    return list;
  }, [items, search, filterCat, filterType]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["restaurant-items"] });
  };

  const handleSave = async (data: any) => {
    try {
      if (editItem) {
        await updateRestaurantItem(editItem.id, data);
        toast({ title: "Plato actualizado" });
      } else {
        await addRestaurantItem(data);
        toast({ title: "Plato creado" });
      }
      invalidate();
      setFormOpen(false);
      setEditItem(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (item: any) => {
    try {
      await duplicateRestaurantItem(item.id);
      invalidate();
      toast({ title: "Plato duplicado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await deleteRestaurantItem(item.id);
      invalidate();
      toast({ title: "Plato eliminado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (item: any) => {
    try {
      await updateRestaurantItem(item.id, { is_active: !item.is_active });
      invalidate();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setFormOpen(true);
  };

  const openNew = () => {
    setEditItem(null);
    setFormOpen(true);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Cargando menú...</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Menú Restaurante</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
            <Tags className="h-4 w-4 mr-1" /> Categorías
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo plato
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <div className="inline-flex h-9 items-center rounded-md border bg-muted p-0.5">
            {([["all", "Todos"], ["platos", "Platos"], ["ofertas", "Ofertas"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterType(val)}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium transition-all ${filterType === val ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {val === "ofertas" && <Tag className="h-3 w-3 mr-1" />}
                {label}
              </button>
            ))}
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.filter((c: any) => c.is_active).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plato</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-center">Activo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {items.length === 0 ? "No hay platos. Creá el primero." : "Sin resultados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item: any) => (
                <TableRow key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {item.is_offer && (
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0 shrink-0">OFERTA</Badge>
                      )}
                      <div>
                        <span className="font-medium">{item.name}</span>
                        {item.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.category_name ? (
                      <Badge variant="secondary">{item.category_name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${item.price.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={() => handleToggle(item)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(item)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => handleDuplicate(item)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(item)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ItemFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditItem(null); }}
        initial={editItem}
        onSave={handleSave}
        title={editItem ? "Editar plato" : "Nuevo plato"}
      />

      <CategoryManager open={catOpen} onOpenChange={setCatOpen} />
    </div>
  );
}
