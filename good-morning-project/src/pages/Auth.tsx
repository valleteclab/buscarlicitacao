import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search } from 'lucide-react';

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard');
      }
    });
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast({
          title: 'Login realizado!',
          description: 'Bem-vindo de volta.',
        });
        navigate('/dashboard');
      } else {
        const fullName = formData.get('fullName') as string;
        const companyName = formData.get('companyName') as string;

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName,
              company_name: companyName,
            },
          },
        });

        if (error) throw error;

        // Create profile
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            email: email,
            full_name: fullName,
            company_name: companyName,
          });
        }

        toast({
          title: 'Conta criada!',
          description: 'Você já pode fazer login.',
        });
        
        navigate('/dashboard');
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Sistema de Licitações PNCP</CardTitle>
          <CardDescription>
            Busca automatizada e gestão inteligente de licitações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={isLogin ? 'login' : 'signup'} onValueChange={(v) => setIsLogin(v === 'login')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="João Silva"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    type="text"
                    placeholder="Empresa Ltda"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
