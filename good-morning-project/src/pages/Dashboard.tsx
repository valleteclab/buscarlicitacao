import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Settings, FileText, LogOut, Plus, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({
    totalConfigs: 0,
    totalLicitacoes: 0,
    novasLicitacoes: 0,
  });

  useEffect(() => {
    checkUser();
    loadStats();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setUser(session.user);
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const { data: configs } = await supabase
        .from('search_configurations')
        .select('id');

      const configIds = configs?.map(c => c.id) || [];

      const { data: licitacoes, count: totalCount } = await supabase
        .from('licitacoes_encontradas')
        .select('id, is_viewed', { count: 'exact' })
        .in('search_config_id', configIds);

      // Usa os logs de busca para saber quantas licitações novas foram inseridas
      // na última execução da função de busca (sem contar as que "já existiam").
      const { data: lastLogs } = await (supabase as any)
        .from('search_logs')
        .select('results_count')
        .order('created_at', { ascending: false })
        .limit(1);

      const novasUltimaExecucao = lastLogs && lastLogs.length > 0
        ? (lastLogs[0]?.results_count as number) || 0
        : 0;

      setStats({
        totalConfigs: configs?.length || 0,
        totalLicitacoes: totalCount || 0,
        novasLicitacoes: novasUltimaExecucao,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Sistema de Licitações PNCP</h1>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
          <p className="text-muted-foreground">
            Bem-vindo de volta! Aqui está o resumo das suas buscas.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Configurações de Busca
              </CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalConfigs}</div>
              <p className="text-xs text-muted-foreground">
                buscas configuradas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Licitações
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLicitacoes}</div>
              <p className="text-xs text-muted-foreground">
                licitações encontradas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Novas Licitações
              </CardTitle>
              <div className="h-4 w-4 rounded-full bg-primary"></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.novasLicitacoes}</div>
              <p className="text-xs text-muted-foreground">
                não visualizadas
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/configuracoes')}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle>Configurações de Busca</CardTitle>
              </div>
              <CardDescription>
                Configure palavras-chave, estados e municípios para buscar licitações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Nova Configuração
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary transition-colors" onClick={() => navigate('/licitacoes')}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Licitações Encontradas</CardTitle>
              </div>
              <CardDescription>
                Visualize e gerencie as licitações encontradas automaticamente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/licitacoes');
                  }}
                >
                  Ver todas
                </Button>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="secondary"
                    className="w-full sm:w-1/2"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/licitacoes?tab=participando');
                    }}
                  >
                    Participando
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-1/2"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/licitacoes?tab=chat_ia');
                    }}
                  >
                    Chat IA
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-primary transition-colors" onClick={() => navigate('/agenda')}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <CardTitle>Agenda de Licitações</CardTitle>
              </div>
              <CardDescription>
                Veja os prazos das licitações que você marcou como "Vou participar"
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/agenda');
                }}
              >
                Ver agenda
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
