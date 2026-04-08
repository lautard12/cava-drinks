import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRestaurantCategories,
  addRestaurantCategory,
  updateRestaurantCategory,
  deleteRestaurantCategory,
} from "@/lib/restaurant-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CategoryManager({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({
    queryKey: ["restaurant-categories"],
    queryFn: fetchRestaurantCategories,
  });

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await addRestaurantCategory(trimmed);
      queryClient.invalidateQueries({ queryKey: ["restaurant-categories"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-items"] });
      setNewName("");
      toast({ title: "Categoría creada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleUpdate = async (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      await updateRestaurantCategory(id, { name: trimmed });
      queryClient.invalidateQueries({ queryKey: ["restaurant-categories"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-items"] });
      setEditId(null);
      toast({ title: "Categoría actualizada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await updateRestaurantCategory(id, { is_active: !current });
      queryClient.invalidateQueries({ queryKey: ["restaurant-categories"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;
    try {
      await deleteRestaurantCategory(id);
      queryClient.invalidateQueries({ queryKey: ["restaurant-categories"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant-items"] });
      toast({ title: "Categoría eliminada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Categorías del Menú</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Nueva categoría..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {categories.map((cat: any) => (
            <div
              key={cat.id}
              className="flex items-center gap-2 p-2 rounded-md border bg-card"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              {editId === cat.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUpdate(cat.id)}
                    className="h-8 flex-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => handleUpdate(cat.id)}>
                    OK
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                    ✕
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{cat.name}</span>
                  <Switch
                    checked={cat.is_active}
                    onCheckedChange={() => handleToggle(cat.id, cat.is_active)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => { setEditId(cat.id); setEditName(cat.name); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(cat.id, cat.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay categorías. Agregá una arriba.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
