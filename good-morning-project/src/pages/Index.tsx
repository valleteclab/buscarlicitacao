import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Search, FileText, Settings, Zap } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">Sistema de Licitações PNCP</span>
          </div>
          <Button onClick={() => navigate('/auth')}>Entrar</Button>
        </div>
      </header>

      <main className="container mx-auto flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="max-w-3xl text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Search className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mb-4 text-4xl font-bold md:text-5xl lg:text-6xl">
            Encontre Licitações Automaticamente
          </h1>
          <p className="mb-8 text-lg text-muted-foreground md:text-xl">
            Busca automática no Portal Nacional de Contratações Públicas (PNCP) com base em suas palavras-chave e filtros personalizados
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => navigate('/auth')}>
              Começar Agora
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/auth')}>
              Saiba Mais
            </Button>
          </div>
        </div>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Busca Automática</h3>
            <p className="text-muted-foreground">
              Configure uma vez e receba licitações relevantes automaticamente
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Documentos Incluídos</h3>
            <p className="text-muted-foreground">
              Editais e anexos baixados automaticamente do PNCP
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-semibold">Filtros Personalizados</h3>
            <p className="text-muted-foreground">
              Configure palavras-chave, estados, municípios e valores
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
