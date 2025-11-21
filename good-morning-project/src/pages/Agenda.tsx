import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Clock, ArrowLeft, ExternalLink, Eye } from 'lucide-react';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface AgendaLicitacao {
  id: string;
  modalidade_nome: string | null;
  numero_compra: string | null;
  ano_compra: number | null;
  orgao_razao_social: string | null;
  municipio_nome: string | null;
  uf_sigla: string | null;
  data_encerramento_proposta: string | null;
  data_limite_interna: string | null;
  status_interno: string | null;
  valor_total_estimado: number | null;
  objeto_compra: string | null;
  data_publicacao_pncp: string | null;
  link_pncp: string | null;
}

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
};

const diffDaysFromNow = (dateString: string | null | undefined): number | null => {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

const Agenda = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [licitacoes, setLicitacoes] = useState<AgendaLicitacao[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterMode, setFilterMode] = useState<'all' | 'near'>('all');
  const [modalLicitacao, setModalLicitacao] = useState<AgendaLicitacao | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }
      await loadAgenda();
    };

    init();
  }, []);

  const loadAgenda = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('licitacoes_encontradas')
        .select('id, modalidade_nome, numero_compra, ano_compra, orgao_razao_social, municipio_nome, uf_sigla, data_encerramento_proposta, data_limite_interna, status_interno, valor_total_estimado, objeto_compra, data_publicacao_pncp, link_pncp')
        .eq('vai_participar', true);

      if (error) throw error;

      const lista = (data || []) as AgendaLicitacao[];

      const sorted = [...lista].sort((a, b) => {
        const aBase = a.data_limite_interna || a.data_encerramento_proposta;
        const bBase = b.data_limite_interna || b.data_encerramento_proposta;
        if (!aBase && !bBase) return 0;
        if (!aBase) return 1;
        if (!bBase) return -1;
        return new Date(aBase).getTime() - new Date(bBase).getTime();
      });

      // Define a data inicialmente selecionada como o primeiro prazo disponível
      let firstDate: Date | undefined;
      for (const l of sorted) {
        const base = l.data_limite_interna || l.data_encerramento_proposta;
        if (!base) continue;
        const d = new Date(base);
        if (Number.isNaN(d.getTime())) continue;
        if (!firstDate || d.getTime() < firstDate.getTime()) {
          firstDate = d;
        }
      }

      setLicitacoes(sorted);
      if (firstDate) {
        setSelectedDate(firstDate);
      }
    } catch (error: any) {
      console.error('Erro ao carregar agenda:', error);
      toast({
        title: 'Erro ao carregar agenda',
        description: error?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getPrazoBaseLabel = (l: AgendaLicitacao) => {
    if (l.data_limite_interna) return 'Prazo interno';
    if (l.data_encerramento_proposta) return 'Encerramento da proposta';
    return 'Sem prazo definido';
  };

  const getPrazoBaseDate = (l: AgendaLicitacao) => {
    return l.data_limite_interna || l.data_encerramento_proposta || null;
  };

  const renderStatusChip = (status: string | null) => {
    if (!status) return null;
    let label = '';
    let badgeClass = 'text-xs';
    if (status === 'em_analise') {
      label = 'Em análise';
      badgeClass =
        'text-xs bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-700';
    } else if (status === 'preparando_proposta') {
      label = 'Preparando proposta';
      badgeClass =
        'text-xs bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700';
    } else if (status === 'enviada') {
      label = 'Proposta enviada';
      badgeClass =
        'text-xs bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700';
    } else if (status === 'resultado') {
      label = 'Aguardando resultado';
      badgeClass =
        'text-xs bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700';
    } else if (status === 'arquivada') {
      label = 'Arquivada';
      badgeClass =
        'text-xs bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-300 dark:border-zinc-700';
    } else {
      label = status;
    }

    return (
      <Badge variant="outline" className={badgeClass}>
        {label}
      </Badge>
    );
  };

  const renderPrazoResumo = (l: AgendaLicitacao) => {
    const baseDate = getPrazoBaseDate(l);
    const dias = diffDaysFromNow(baseDate);

    if (!baseDate) {
      return <p className="text-xs text-muted-foreground">Sem prazo definido</p>;
    }

    let descricao = '';
    let classe = 'text-xs text-muted-foreground';

    if (dias === null) {
      descricao = `Prazo em ${formatDate(baseDate)}`;
    } else if (dias > 7) {
      descricao = `Prazo em ${dias} dia(s)`;
      classe = 'text-xs text-emerald-600 dark:text-emerald-400';
    } else if (dias > 0) {
      descricao = `Prazo em ${dias} dia(s)`;
      classe = 'text-xs text-amber-600 dark:text-amber-400';
    } else if (dias === 0) {
      descricao = 'Prazo é hoje';
      classe = 'text-xs text-red-600 dark:text-red-400';
    } else {
      descricao = `Prazo encerrado há ${Math.abs(dias)} dia(s)`;
      classe = 'text-xs text-red-600 dark:text-red-400';
    }

    return (
      <p className={classe}>{descricao}</p>
    );
  };

  const selectedDateStr = selectedDate ? selectedDate.toISOString().slice(0, 10) : null;

  const licitacoesComPrazoBase = licitacoes.filter((l) => getPrazoBaseDate(l));
  const licitacoesSemPrazo = licitacoes.filter((l) => !getPrazoBaseDate(l));

  const licitacoesComPrazo =
    filterMode === 'near'
      ? licitacoesComPrazoBase.filter((l) => {
          const base = getPrazoBaseDate(l);
          const dias = diffDaysFromNow(base);
          // Próximos 7 dias (inclui hoje)
          return dias !== null && dias >= 0 && dias <= 7;
        })
      : licitacoesComPrazoBase;

  const licitacoesDoDia = selectedDateStr
    ? licitacoesComPrazo.filter((l) => {
        const base = getPrazoBaseDate(l);
        if (!base) return false;
        const d = new Date(base);
        if (Number.isNaN(d.getTime())) return false;
        const dStr = d.toISOString().slice(0, 10);
        return dStr === selectedDateStr;
      })
    : [];

  const resumoStatusDia = licitacoesDoDia.reduce(
    (acc, l) => {
      if (l.status_interno === 'em_analise') acc.emAnalise += 1;
      else if (l.status_interno === 'preparando_proposta') acc.preparando += 1;
      else if (l.status_interno === 'enviada') acc.enviada += 1;
      else if (l.status_interno === 'resultado') acc.resultado += 1;
      else if (l.status_interno === 'arquivada') acc.arquivada += 1;
      return acc;
    },
    { emAnalise: 0, preparando: 0, enviada: 0, resultado: 0, arquivada: 0 },
  );

  const diasComLicitacao: Date[] = Array.from(
    new Set(
      licitacoesComPrazo
        .map((l) => {
          const base = getPrazoBaseDate(l);
          if (!base) return null;
          const d = new Date(base);
          if (Number.isNaN(d.getTime())) return null;
          return d.toISOString().slice(0, 10);
        })
        .filter(Boolean) as string[],
    ),
  ).map((dateStr) => new Date(dateStr));

  const proximosPrazosOrdenados = licitacoesComPrazoBase
    .filter((l) => {
      const base = getPrazoBaseDate(l);
      const dias = diffDaysFromNow(base);
      return dias !== null && dias >= 0;
    })
    .sort((a, b) => {
      const aBase = getPrazoBaseDate(a);
      const bBase = getPrazoBaseDate(b);
      if (!aBase && !bBase) return 0;
      if (!aBase) return 1;
      if (!bBase) return -1;
      return new Date(aBase).getTime() - new Date(bBase).getTime();
    });

  const proximosPrazos = proximosPrazosOrdenados.slice(0, 4);
  const prazoMaisProximo = proximosPrazosOrdenados.length > 0 ? proximosPrazosOrdenados[0] : null;

  const openDetalhesModal = (l: AgendaLicitacao) => {
    setModalLicitacao(l);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Agenda de Licitações</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Prazos das licitações que você vai participar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Visualize em uma linha do tempo os prazos internos e de envio de proposta para organizar sua rotina.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAgenda} disabled={loading}>
            <Clock className="mr-2 h-4 w-4" />
            Atualizar agenda
          </Button>
        </div>

        {licitacoes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">Filtro:</span>
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              variant={filterMode === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterMode('all')}
            >
              Todos os prazos
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              variant={filterMode === 'near' ? 'default' : 'outline'}
              onClick={() => setFilterMode('near')}
            >
              Próximos 7 dias
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : licitacoes.length === 0 ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center justify-center text-center gap-2">
              <CalendarIcon className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                Nenhuma licitação marcada como "Vou participar" ainda.
              </p>
              <p className="text-sm text-muted-foreground">
                Volte para a aba "Vou participar" nas licitações e marque as oportunidades que você deseja acompanhar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <DateCalendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        numberOfMonths={1}
                        className="rounded-md border w-full max-w-md mx-auto"
                        modifiers={{ hasLicitacao: diasComLicitacao }}
                        modifiersClassNames={{
                          hasLicitacao:
                            'border border-primary/30 bg-primary/5 text-primary font-medium',
                        }}
                      />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold">
                        {selectedDate
                          ? `Prazos em ${selectedDate.toLocaleDateString('pt-BR')}`
                          : 'Selecione um dia no calendário'}
                      </h3>
                      {licitacoesDoDia.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma licitação com prazo neste dia.
                        </p>
                      ) : (
                        licitacoesDoDia.map((l) => {
                          const prazoBaseLabel = getPrazoBaseLabel(l);
                          const prazoBaseDate = getPrazoBaseDate(l);

                          return (
                            <Card key={l.id} className="overflow-hidden border-muted">
                              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                                <div className="space-y-1">
                                  <CardTitle className="text-sm">
                                    {l.modalidade_nome || 'Licitação'}
                                    {l.numero_compra && (
                                      <span>{` nº ${l.numero_compra}${l.ano_compra ? `/${l.ano_compra}` : ''}`}</span>
                                    )}
                                  </CardTitle>
                                  <CardDescription className="text-xs">
                                    {l.orgao_razao_social || 'Órgão não informado'}
                                    {l.municipio_nome && l.uf_sigla && (
                                      <span>{` • ${l.municipio_nome}/${l.uf_sigla}`}</span>
                                    )}
                                  </CardDescription>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    {renderStatusChip(l.status_interno)}
                                    {l.valor_total_estimado != null && (
                                      <span className="text-xs font-medium text-primary">
                                        {l.valor_total_estimado.toLocaleString('pt-BR', {
                                          style: 'currency',
                                          currency: 'BRL',
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right space-y-1 text-xs">
                                  <p className="font-semibold">{prazoBaseLabel}</p>
                                  {prazoBaseDate && (
                                    <p className="text-muted-foreground">{formatDate(prazoBaseDate)}</p>
                                  )}
                                  {renderPrazoResumo(l)}
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0 flex justify-end gap-2 pb-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openDetalhesModal(l)}
                                >
                                  Ver detalhes
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {licitacoesSemPrazo.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Licitações sem prazo definido</CardTitle>
                    <CardDescription className="text-xs">
                      Estas licitações estão marcadas como "Vou participar", mas não possuem data interna
                      nem data de encerramento de proposta registrada.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {licitacoesSemPrazo.map((l) => (
                      <div key={l.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">
                            {l.modalidade_nome || 'Licitação'}
                            {l.numero_compra && (
                              <span>{` nº ${l.numero_compra}${l.ano_compra ? `/${l.ano_compra}` : ''}`}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {l.orgao_razao_social || 'Órgão não informado'}
                            {l.municipio_nome && l.uf_sigla && (
                              <span>{` • ${l.municipio_nome}/${l.uf_sigla}`}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderStatusChip(l.status_interno)}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDetalhesModal(l)}
                          >
                            Ver detalhes
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Resumo do dia</CardTitle>
                  <CardDescription className="text-xs">
                    {selectedDate
                      ? selectedDate.toLocaleDateString('pt-BR')
                      : 'Selecione um dia no calendário'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {licitacoesDoDia.length === 0 ? (
                    <p className="text-muted-foreground">
                      Nenhuma licitação com prazo neste dia.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total de prazos</span>
                        <span className="font-semibold">{licitacoesDoDia.length}</span>
                      </div>
                      {resumoStatusDia.emAnalise > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Em análise</span>
                          <span className="font-medium">{resumoStatusDia.emAnalise}</span>
                        </div>
                      )}
                      {resumoStatusDia.preparando > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Preparando proposta</span>
                          <span className="font-medium">{resumoStatusDia.preparando}</span>
                        </div>
                      )}
                      {resumoStatusDia.enviada > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Proposta enviada</span>
                          <span className="font-medium">{resumoStatusDia.enviada}</span>
                        </div>
                      )}
                      {resumoStatusDia.resultado > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Aguardando resultado</span>
                          <span className="font-medium">{resumoStatusDia.resultado}</span>
                        </div>
                      )}
                      {resumoStatusDia.arquivada > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Arquivada</span>
                          <span className="font-medium">{resumoStatusDia.arquivada}</span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Próximos prazos</CardTitle>
                  <CardDescription className="text-xs">
                    As próximas licitações com prazo de envio de proposta ou interno.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {proximosPrazos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum prazo futuro registrado.
                    </p>
                  ) : (
                    proximosPrazos.map((l) => {
                      const prazoBaseDate = getPrazoBaseDate(l);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => openDetalhesModal(l)}
                          className="w-full text-left text-xs rounded-md border bg-muted/40 px-3 py-2 hover:bg-muted transition flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">
                              {l.modalidade_nome || 'Licitação'}
                            </span>
                            {prazoBaseDate && (
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {formatDate(prazoBaseDate)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground truncate">
                              {l.orgao_razao_social || 'Órgão não informado'}
                            </span>
                            {renderPrazoResumo(l)}
                          </div>
                        </button>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Contagem regressiva</CardTitle>
                  <CardDescription className="text-xs">
                    Licitação com prazo mais próximo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!prazoMaisProximo ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum prazo futuro registrado.
                    </p>
                  ) : (
                    (() => {
                      const base = getPrazoBaseDate(prazoMaisProximo);
                      const dias = diffDaysFromNow(base);
                      const prazoLabel = getPrazoBaseLabel(prazoMaisProximo);

                      if (dias === null || base === null) {
                        return (
                          <div className="space-y-2 text-xs">
                            <p className="font-medium">
                              {prazoMaisProximo.modalidade_nome || 'Licitação'}
                            </p>
                            {base && (
                              <p className="text-muted-foreground">
                                {prazoLabel}: {formatDate(base)}
                              </p>
                            )}
                          </div>
                        );
                      }

                      let destaqueClasse =
                        'text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400';
                      if (dias <= 3) {
                        destaqueClasse =
                          'text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400';
                      }
                      if (dias === 0) {
                        destaqueClasse =
                          'text-3xl font-bold tracking-tight text-red-600 dark:text-red-400';
                      }

                      return (
                        <div className="space-y-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                {prazoMaisProximo.modalidade_nome || 'Licitação'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {prazoMaisProximo.orgao_razao_social || 'Órgão não informado'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={destaqueClasse}>
                                {dias === 0 ? 'Hoje' : `${dias}d`}
                              </p>
                              {base && (
                                <p className="text-[11px] text-muted-foreground">
                                  {formatDate(base)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-xs">{renderPrazoResumo(prazoMaisProximo)}</div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() =>
                                navigate(
                                  `/licitacoes?tab=participando&licitacao=${prazoMaisProximo.id}`,
                                )
                              }
                            >
                              Ver detalhes
                            </Button>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Legenda de status</CardTitle>
                  <CardDescription className="text-xs">
                    Cores usadas para indicar o andamento das licitações e a urgência dos prazos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Status interno</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Em análise</span>
                        {renderStatusChip('em_analise')}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Preparando proposta</span>
                        {renderStatusChip('preparando_proposta')}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Proposta enviada</span>
                        {renderStatusChip('enviada')}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Aguardando resultado</span>
                        {renderStatusChip('resultado')}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Arquivada</span>
                        {renderStatusChip('arquivada')}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Urgência do prazo</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="text-muted-foreground">Prazo em mais de 7 dias</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
                        <span className="text-muted-foreground">Prazo em até 7 dias</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">Prazo hoje ou atrasado</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        )}
      </main>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setModalLicitacao(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {modalLicitacao ? (
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold">
                    {modalLicitacao.modalidade_nome || 'Licitação'}
                    {modalLicitacao.numero_compra && (
                      <span>{` nº ${modalLicitacao.numero_compra}${modalLicitacao.ano_compra ? `/${modalLicitacao.ano_compra}` : ''}`}</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {modalLicitacao.orgao_razao_social || 'Órgão não informado'}
                    {modalLicitacao.municipio_nome && modalLicitacao.uf_sigla && (
                      <span>{` • ${modalLicitacao.municipio_nome}/${modalLicitacao.uf_sigla}`}</span>
                    )}
                  </span>
                </div>
              ) : (
                'Licitação'
              )}
            </DialogTitle>
            {modalLicitacao && (
              <DialogDescription>
                Visualize rapidamente os prazos e dados principais. Para checklist,
                notas e documentos completos, use o botão de gestão.
              </DialogDescription>
            )}
          </DialogHeader>

          {modalLicitacao && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{getPrazoBaseLabel(modalLicitacao)}</p>
                  {getPrazoBaseDate(modalLicitacao) && (
                    <p className="text-sm font-semibold">
                      {formatDate(getPrazoBaseDate(modalLicitacao))}
                    </p>
                  )}
                  {renderPrazoResumo(modalLicitacao)}
                </div>
                <div className="text-right space-y-1">
                  {renderStatusChip(modalLicitacao.status_interno)}
                  {modalLicitacao.valor_total_estimado != null && (
                    <p className="text-sm font-semibold text-primary">
                      {modalLicitacao.valor_total_estimado.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </p>
                  )}
                  {modalLicitacao.data_publicacao_pncp && (
                    <p className="text-[11px] text-muted-foreground">
                      Publicado em {formatDate(modalLicitacao.data_publicacao_pncp)}
                    </p>
                  )}
                </div>
              </div>

              {modalLicitacao.objeto_compra && (
                <div className="border rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  {modalLicitacao.objeto_compra}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                {modalLicitacao.link_pncp && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => window.open(modalLicitacao.link_pncp as string, '_blank')}
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Ver no PNCP
                  </Button>
                )}
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    if (!modalLicitacao) return;
                    navigate(`/licitacoes?tab=participando&licitacao=${modalLicitacao.id}`, {
                      state: { fromAgenda: true },
                    });
                  }}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Abrir gestão completa
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Agenda;
