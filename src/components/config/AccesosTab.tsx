import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";

export function AccesosTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Roles del sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
          <Badge className="mt-0.5">admin</Badge>
          <p className="text-sm text-muted-foreground">
            Acceso total: Finanzas, Stock, Ventas, Precios, Compras, Ofertas, Configuración y Usuarios.
          </p>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
          <Badge variant="outline" className="mt-0.5">cajero</Badge>
          <p className="text-sm text-muted-foreground">
            Acceso restringido: Caja (POS) y Stock (solo lectura).
          </p>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
          <Badge variant="outline" className="mt-0.5">cocina</Badge>
          <p className="text-sm text-muted-foreground">
            Acceso restringido: solo monitor de Cocina.
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Para gestionar usuarios y asignar roles, andá a la sección <strong>Usuarios</strong>.
        </p>
      </CardContent>
    </Card>
  );
}
