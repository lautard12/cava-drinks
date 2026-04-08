import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRestaurantCategories } from "@/lib/restaurant-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ItemData {
  id?: string;
  name: string;
  category_id: string | null;
  price: number;
  description: string;
  is_active: boolean;
  is_offer: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ItemData | null;
  onSave: (data: Omit<ItemData, "id">) => void;
  title: string;
}

export default function ItemFormDialog({ open, onOpenChange, initial, onSave, title }: Props) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isOffer, setIsOffer] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["restaurant-categories"],
    queryFn: fetchRestaurantCategories,
  });

  useEffect(() => {
    if (open && initial) {
      setName(initial.name);
      setCategoryId(initial.category_id ?? "none");
      setPrice(String(initial.price));
      setDescription(initial.description ?? "");
      setIsActive(initial.is_active);
      setIsOffer(initial.is_offer ?? false);
    } else if (open) {
      setName("");
      setCategoryId("none");
      setPrice("");
      setDescription("");
      setIsActive(true);
      setIsOffer(false);
    }
  }, [open, initial]);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const numPrice = Math.max(0, parseInt(price) || 0);
    onSave({
      name: trimmedName,
      category_id: categoryId === "none" ? null : categoryId,
      price: numPrice,
      description: description.trim(),
      is_active: isActive,
      is_offer: isOffer,
    });
  };

  const activeCategories = categories.filter((c: any) => c.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Milanesa napolitana" />
          </div>

          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {activeCategories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Precio</Label>
            <Input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional..."
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isOffer} onCheckedChange={setIsOffer} />
            <Label>Es oferta / promo</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>Activo</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
