import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, Pencil, Trash2, Power, PowerOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface SearchConfig {
  id: string;
  name: string;
  keywords: any;
  states: string[];
  is_active: boolean;
  last_search_date: string;
}

const Configuracoes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SearchConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SearchConfig | null>(null);

  useEffect(() => {
    checkAuth();
    loadConfigs();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  };

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('search_configurations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar configurações',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const name = formData.get('name') as string;
    const keywordsStr = formData.get('keywords') as string;
    const statesStr = formData.get('states') as string;

    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);
    const states = statesStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s);

    try {
      if (editingConfig) {
        const { error } = await supabase
          .from('search_configurations')
          .update({ name, keywords, states })
          .eq('id', editingConfig.id);

        if (error) throw error;
        toast({ title: 'Configuração atualizada!' });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { error } = await supabase
          .from('search_configurations')
          .insert({ name, keywords, states, user_id: user.id });

        if (error) throw error;
        toast({ title: 'Configuração criada!' });
      }

      setDialogOpen(false);
      setEditingConfig(null);
      loadConfigs();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (config: SearchConfig) => {
    try {
      const { error } = await supabase
        .from('search_configurations')
        .update({ is_active: !config.is_active })
        .eq('id', config.id);

      if (error) throw error;
      loadConfigs();
      toast({
        title: config.is_active ? 'Busca desativada' : 'Busca ativada',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta configuração?')) return;

    try {
      const { error } = await supabase
        .from('search_configurations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadConfigs();
      toast({ title: 'Configuração excluída' });
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Configurações de Busca</h1>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Suas Configurações</h2>
            <p className="text-muted-foreground">
              Configure palavras-chave e filtros para buscar licitações
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingConfig(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Configuração
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingConfig ? 'Editar Configuração' : 'Nova Configuração'}
                </DialogTitle>
                <DialogDescription>
                  Configure os filtros para buscar licitações automaticamente
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Configuração</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ex: Materiais de TI - SP"
                    defaultValue={editingConfig?.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keywords">Palavras-chave (separadas por vírgula)</Label>
                  <Input
                    id="keywords"
                    name="keywords"
                    placeholder="notebook, computador, impressora"
                    defaultValue={editingConfig?.keywords?.join(', ')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="states">Estados (UF, separadas por vírgula)</Label>
                  <Input
                    id="states"
                    name="states"
                    placeholder="SP, RJ, MG"
                    defaultValue={editingConfig?.states?.join(', ')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para buscar em todos os estados
                  </p>
                </div>
                <Button type="submit" className="w-full">
                  {editingConfig ? 'Atualizar' : 'Criar'} Configuração
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : configs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                Você ainda não tem configurações de busca
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeira Configuração
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {configs.map((config) => (
              <Card key={config.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle>{config.name}</CardTitle>
                        {config.is_active ? (
                          <Badge className="bg-green-500">Ativa</Badge>
                        ) : (
                          <Badge variant="secondary">Inativa</Badge>
                        )}
                      </div>
                      <CardDescription>
                        {config.last_search_date
                          ? `Última busca: ${new Date(config.last_search_date).toLocaleString('pt-BR')}`
                          : 'Ainda não executada'}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(config)}
                      >
                        {config.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingConfig(config);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(config.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium mb-1">Palavras-chave:</p>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(config.keywords) ? config.keywords : [])?.map((keyword: string, i: number) => (
                          <Badge key={i} variant="outline">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {config.states && config.states.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-1">Estados:</p>
                        <div className="flex flex-wrap gap-1">
                          {config.states.map((state, i) => (
                            <Badge key={i} variant="secondary">
                              {state}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Configuracoes;
