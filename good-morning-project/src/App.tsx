import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Configuracoes from "./pages/Configuracoes";
import Licitacoes from "./pages/Licitacoes";
import Agenda from "./pages/Agenda";
import Monitoramento from "./pages/Monitoramento";
import NotFound from "./pages/NotFound";
import AppLayout from "./layouts/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/licitacoes" element={<Licitacoes />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/monitoramento" element={<Monitoramento />} />
            <Route
              path="/participando"
              element={<Navigate to="/licitacoes?tab=participando" replace />}
            />
            <Route
              path="/chat-ia"
              element={<Navigate to="/licitacoes?tab=chat_ia" replace />}
            />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
