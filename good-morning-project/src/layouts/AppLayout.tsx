import { useLocation, useNavigate } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { Search, LayoutDashboard, FileText, Calendar, MessageCircle, Settings, ListChecks, LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const activeTab = params.get('tab');

  const menuItems = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      to: '/dashboard',
      isActive: () => location.pathname === '/dashboard',
    },
    {
      key: 'licitacoes',
      label: 'Licitações',
      icon: FileText,
      to: '/licitacoes',
      isActive: () =>
        location.pathname === '/licitacoes' &&
        (!activeTab || (activeTab !== 'participando' && activeTab !== 'chat_ia')),
    },
    {
      key: 'participando',
      label: 'Participando',
      icon: ListChecks,
      to: '/licitacoes?tab=participando',
      isActive: () => location.pathname === '/licitacoes' && activeTab === 'participando',
    },
    {
      key: 'agenda',
      label: 'Agenda',
      icon: Calendar,
      to: '/agenda',
      isActive: () => location.pathname === '/agenda',
    },
    {
      key: 'chat-ia',
      label: 'Chat IA',
      icon: MessageCircle,
      to: '/licitacoes?tab=chat_ia',
      isActive: () => location.pathname === '/licitacoes' && activeTab === 'chat_ia',
    },
    {
      key: 'configuracoes',
      label: 'Configurações',
      icon: Settings,
      to: '/configuracoes',
      isActive: () => location.pathname === '/configuracoes',
    },
    {
      key: 'monitoramento',
      label: 'Monitoramento',
      icon: Activity,
      to: '/monitoramento',
      isActive: () => location.pathname === '/monitoramento',
    },
  ] as const;

  const handleNavigate = (to: string) => {
    navigate(to);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error) {
      // Falha silenciosa; páginas individuais tratam erros de autenticação
      console.error('Erro ao sair:', error);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex md:flex-col w-60 lg:w-64 border-r bg-card">
        <div className="flex items-center gap-2 px-4 py-4 border-b">
          <Search className="h-5 w-5 text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Sistema de Licitações PNCP</span>
            <span className="text-[11px] text-muted-foreground">Organize suas licitações</span>
          </div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = item.isActive();

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.to)}
                className={cn(
                  'w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Licitações PNCP</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-1" />
            Sair
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
