import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

type AppRole = "admin" | "cajero" | "cocina";

interface UserRow {
  user_id: string;
  display_name: string;
  role: AppRole;
}

export default function Usuarios() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", display_name: "", role: "cajero" as AppRole });
  const [editForm, setEditForm] = useState({ user_id: "", display_name: "", role: "cajero" as AppRole, password: "" });
  const [busy, setBusy] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("user_id, display_name");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      if (!profiles || !roles) return [];
      const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
      return profiles.map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        role: roleMap.get(p.user_id) ?? ("cajero" as AppRole),
      })) as UserRow[];
    },
  });

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.display_name) {
      toast({ title: "Completá todos los campos", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email: createForm.email, password: createForm.password, display_name: createForm.display_name, role: createForm.role },
    });
    setBusy(false);
    if (error || data?.error) {
      toast({ title: "Error al crear usuario", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Usuario creado correctamente" });
    setCreateOpen(false);
    setCreateForm({ email: "", password: "", display_name: "", role: "cajero" });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const openEdit = (u: UserRow) => {
    setEditForm({ user_id: u.user_id, display_name: u.display_name, role: u.role, password: "" });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editForm.display_name) {
      toast({ title: "El nombre es requerido", variant: "destructive" });
      return;
    }
    setBusy(true);
    const body: Record<string, string> = {
      user_id: editForm.user_id,
      display_name: editForm.display_name,
      role: editForm.role,
    };
    if (editForm.password) body.password = editForm.password;

    const { data, error } = await supabase.functions.invoke("update-user", { body });
    setBusy(false);
    if (error || data?.error) {
      toast({ title: "Error al actualizar", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Usuario actualizado" });
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("¿Eliminar este usuario?")) return;
    const { error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
    if (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
      return;
    }
    toast({ title: "Usuario eliminado" });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  if (isLoading) return <p className="p-6 text-muted-foreground">Cargando…</p>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> Usuarios
        </h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Agregar usuario
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="w-28">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium">{u.display_name}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(u.user_id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No hay usuarios registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={createForm.display_name} onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v as AppRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="cocina">Cocina</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={busy} className="w-full">
              {busy ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={editForm.display_name} onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as AppRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="cocina">Cocina</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nueva contraseña <span className="text-muted-foreground text-xs">(dejar vacío para no cambiar)</span></Label>
              <Input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
            </div>
            <Button onClick={handleEdit} disabled={busy} className="w-full">
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
