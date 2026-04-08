import { Package, Box, UtensilsCrossed, ShoppingCart, ClipboardCheck, Wallet, BookOpen, Users, LogOut, ChefHat, Tag, Truck, Settings } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

type AppRole = "admin" | "cajero" | "cocina";

interface NavItem {
  title: string;
  url: string;
  icon: typeof Package;
  roles: AppRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Restaurante",
    items: [
      { title: "Menú Restaurante", url: "/restaurant-menu", icon: UtensilsCrossed, roles: ["admin"] },
      { title: "Ofertas", url: "/ofertas", icon: Tag, roles: ["admin"] },
      { title: "Caja", url: "/caja", icon: ShoppingCart, roles: ["admin", "cajero"] },
      { title: "Cocina", url: "/cocina", icon: ChefHat, roles: ["admin", "cocina"] },
    ],
  },
  {
    label: "Inventario",
    items: [
      { title: "Stock", url: "/stock", icon: Package, roles: ["admin", "cajero"] },
      { title: "Productos", url: "/products", icon: Box, roles: ["admin"] },
      { title: "Compras", url: "/compras", icon: Truck, roles: ["admin"] },
      { title: "Cierre del Día", url: "/cierre-del-dia", icon: ClipboardCheck, roles: ["admin"] },
    ],
  },
  {
    label: "Contabilidad",
    items: [
      { title: "Finanzas", url: "/finanzas", icon: Wallet, roles: ["admin"] },
      { title: "Movimientos", url: "/movimientos", icon: BookOpen, roles: ["admin"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Usuarios", url: "/usuarios", icon: Users, roles: ["admin"] },
      { title: "Configuración", url: "/configuracion", icon: Settings, roles: ["admin"] },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { role, signOut } = useAuth();
  const collapsed = state === "collapsed";

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => role && i.roles.includes(role)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
              Cava
            </h1>
            <span className="text-xs text-muted-foreground -mt-0.5">Gestión</span>
          </div>
        )}
        <SidebarTrigger className={collapsed ? "mx-auto" : "ml-auto"} />
      </div>
      <SidebarContent>
        {visibleGroups.map((group, idx) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <span className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end={false}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
            {idx < visibleGroups.length - 1 && (
              <Separator className="mt-2 bg-sidebar-border" />
            )}
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          className="w-full justify-start text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
