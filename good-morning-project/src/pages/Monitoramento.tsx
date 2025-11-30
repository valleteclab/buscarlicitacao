import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SearchLogRow {
  id: string;
  created_at: string;
  search_configuration_id: string | null;
  params: {
    states?: string[];
    keywords?: string[];
    modalidades?: number[];
    [key: string]: any;
  };
  status: 'success' | 'error' | string;
  results_count: number;
  error_message: string | null;
}

const Monitoramento = () => {
  const [logs, setLogs] = useState<SearchLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunningIA, setIsRunningIA] = useState(false);
  const [iaMessage, setIaMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadLogs = async () => {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('search_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Erro ao carregar logs de busca:', error);
        setError(error.message || 'Erro ao carregar logs de busca.');
        setIsLoading(false);
        return;
      }

      setLogs((data as SearchLogRow[]) || []);
      setIsLoading(false);
    };

    loadLogs();
  }, []);

  const formatDateTime = (iso: string) => {
    try {
      return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return iso;
    }
  };

  const renderParamsSummary = (params: SearchLogRow['params']) => {
    const parts: string[] = [];

    if (params.keywords && params.keywords.length > 0) {
      parts.push(`Palavras-chave: ${params.keywords.join(', ')}`);
    }

    if (params.states && params.states.length > 0) {
      parts.push(`UFs: ${params.states.join(', ')}`);
    }

    if (params.modalidades && params.modalidades.length > 0) {
      parts.push(`Modalidades: ${params.modalidades.join(', ')}`);
    }

    if (parts.length === 0) {
      return 'Sem filtros específicos (busca geral)';
    }

    return parts.join(' • ');
  };

  const handleRunIA = async () => {
    setIsRunningIA(true);
    setIaMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke('ia-filtrar', {
        body: {},
      });

      if (error) {
        console.error('Erro ao executar IA em lote:', error);
        setIaMessage(error.message || 'Erro ao executar IA em lote.');
      } else {
        const processed = (data as any)?.processed ?? 0;
        const message = (data as any)?.message as string | undefined;
        if (processed === 0 && message) {
          setIaMessage(message);
        } else {
          setIaMessage(`IA executada com sucesso. Licitações processadas neste lote: ${processed}.`);
        }
      }
    } catch (e: any) {
      console.error('Erro inesperado ao chamar função ia-filtrar:', e);
      setIaMessage(e?.message || 'Erro inesperado ao executar IA em lote.');
    } finally {
      setIsRunningIA(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Monitoramento de Buscas PNCP</h1>
        <p className="text-sm text-muted-foreground">
          Visão administrativa das execuções da função de busca no PNCP, para fins de auditoria e acompanhamento.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-4 justify-between items-center">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Últimas execuções registradas</p>
          <p className="text-lg font-semibold">{logs.length}</p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm text-muted-foreground">Total de licitações encontradas nestes logs</p>
          <p className="text-lg font-semibold">
            {logs.reduce((acc, log) => acc + (log.results_count || 0), 0)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" onClick={handleRunIA} disabled={isRunningIA}>
            {isRunningIA ? 'Executando IA em lote...' : 'Rodar IA em lote (backfill)'}
          </Button>
          {iaMessage && (
            <p className="text-xs text-muted-foreground max-w-xs text-right">
              {iaMessage}
            </p>
          )}
        </div>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-6 text-center space-y-2">
          <p className="font-medium">Nenhum log de busca encontrado</p>
          <p className="text-sm text-muted-foreground">
            Assim que a função de busca no PNCP for executada, os registros aparecerão aqui.
          </p>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Data / Hora</TableHead>
                <TableHead>Configuração</TableHead>
                <TableHead>Parâmetros</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[120px]">Resultados</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.search_configuration_id || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {renderParamsSummary(log.params || {})}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={log.status === 'success' ? 'outline' : 'destructive'}
                      className={
                        log.status === 'success'
                          ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : ''
                      }
                    >
                      {log.status === 'success' ? 'Sucesso' : 'Erro'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {log.results_count}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {log.error_message || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default Monitoramento;
