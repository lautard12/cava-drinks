import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogoTab } from "@/components/config/CatalogoTab";
import { PreciosTab } from "@/components/config/PreciosTab";
import { OfertasTab } from "@/components/config/OfertasTab";
import { AccesosTab } from "@/components/config/AccesosTab";

export default function Configuracion() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="precios">Precios y Cobros</TabsTrigger>
          <TabsTrigger value="ofertas">Ofertas</TabsTrigger>
          <TabsTrigger value="accesos">Accesos</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo"><CatalogoTab /></TabsContent>
        <TabsContent value="precios"><PreciosTab /></TabsContent>
        <TabsContent value="ofertas"><OfertasTab /></TabsContent>
        <TabsContent value="accesos"><AccesosTab /></TabsContent>
      </Tabs>
    </div>
  );
}
