import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Stock from "./pages/Stock";
import Products from "./pages/Products";
import RestaurantMenu from "./pages/RestaurantMenu";
import POS from "./pages/POS";
import CierreDelDia from "./pages/CierreDelDia";
import Finanzas from "./pages/Finanzas";
import Movimientos from "./pages/Movimientos";
import Usuarios from "./pages/Usuarios";
import Cocina from "./pages/Cocina";
import Compras from "./pages/Compras";
import Ofertas from "./pages/Ofertas";
import Configuracion from "./pages/Configuracion";
import NotFound from "./pages/NotFound";
import { useAuth } from "@/hooks/useAuth";

function DefaultRedirect() {
  const { role } = useAuth();
  if (role === "cajero") return <Navigate to="/caja" replace />;
  if (role === "cocina") return <Navigate to="/cocina" replace />;
  return <Navigate to="/stock" replace />;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<DefaultRedirect />} />
                      <Route path="/stock" element={<ProtectedRoute allowedRoles={["admin", "cajero"]}><Stock /></ProtectedRoute>} />
                      <Route path="/products" element={<ProtectedRoute allowedRoles={["admin"]}><Products /></ProtectedRoute>} />
                      <Route path="/compras" element={<ProtectedRoute allowedRoles={["admin"]}><Compras /></ProtectedRoute>} />
                      <Route path="/restaurant-menu" element={<ProtectedRoute allowedRoles={["admin"]}><RestaurantMenu /></ProtectedRoute>} />
                      <Route path="/ofertas" element={<ProtectedRoute allowedRoles={["admin"]}><Ofertas /></ProtectedRoute>} />
                      <Route path="/caja" element={<POS />} />
                      <Route path="/cierre-del-dia" element={<ProtectedRoute allowedRoles={["admin"]}><CierreDelDia /></ProtectedRoute>} />
                      <Route path="/finanzas" element={<ProtectedRoute allowedRoles={["admin"]}><Finanzas /></ProtectedRoute>} />
                      <Route path="/movimientos" element={<ProtectedRoute allowedRoles={["admin"]}><Movimientos /></ProtectedRoute>} />
                      <Route path="/usuarios" element={<ProtectedRoute allowedRoles={["admin"]}><Usuarios /></ProtectedRoute>} />
                      <Route path="/configuracion" element={<ProtectedRoute allowedRoles={["admin"]}><Configuracion /></ProtectedRoute>} />
                      <Route path="/cocina" element={<ProtectedRoute allowedRoles={["admin", "cocina"]}><Cocina /></ProtectedRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
