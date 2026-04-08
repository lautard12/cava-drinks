import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function OfertasTab() {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ofertas y Promociones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Las ofertas se gestionan desde el módulo dedicado. Podés crear combos, promociones por cantidad
          y ofertas de precio fijo exclusivas para productos LOCAL.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate("/ofertas")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Ir a Ofertas
          </Button>
          <Button variant="outline" onClick={() => navigate("/restaurant-menu")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Ir a Menú Restaurante
          </Button>
        </div>
        <div className="rounded-lg border p-3 bg-muted/30 text-sm text-muted-foreground space-y-2">
          <p><strong>Ofertas LOCAL</strong> → Combos y promos de productos del catálogo. Descuentan stock al cobrar.</p>
          <p><strong>Ofertas Restaurante</strong> → Ítems del menú marcados como oferta. Se envían a cocina normalmente.</p>
        </div>
      </CardContent>
    </Card>
  );
}
