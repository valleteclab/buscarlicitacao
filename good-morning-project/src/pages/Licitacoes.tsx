import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, FileText, Download, Eye, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Licitacao {
  id: string;
  numero_controle_pncp: string;
  numero_compra: string;
  ano_compra: number;
  objeto_compra: string;
  modalidade_nome: string;
  valor_total_estimado?: number | null;
  data_publicacao_pncp: string;
  data_encerramento_proposta?: string | null;
  data_abertura_proposta?: string | null;
  orgao_razao_social: string;
  municipio_nome: string;
  uf_sigla: string;
  link_pncp: string;
  is_viewed: boolean;
  search_config_id?: string | null;
  orgao_cnpj?: string;
  vai_participar?: boolean;
  status_interno?: string;
  data_limite_interna?: string | null;
  ia_score?: number | null;
  ia_justificativa?: string | null;
  ia_filtrada?: boolean | null;
  ia_needs_review?: boolean | null;
  ia_processing_error?: string | null;
  gestao_checklist?: { id: string; label: string; done: boolean }[] | null;
  gestao_notas?: string | null;
}

interface LicitacaoEditalIA {
  licitacao_encontrada_id: string;
  edital_url?: string | null;
  ia_status?: 'pending' | 'processing' | 'done' | 'error' | string | null;
  ia_resumo?: string | null;
  ia_requisitos_obrigatorios?: string[] | null;
  ia_documentos_exigidos?: string[] | null;
  ia_riscos?: string[] | null;
  ia_recomendacao_participar?: boolean | null;
  ia_justificativa?: string | null;
  ia_score_adequacao?: number | null;
  ia_processing_error?: string | null;
  ia_raw_json?: any | null;
}

interface Documento {
  id: string;
  tipo_documento_nome: string;
  nome_arquivo_pncp: string;
  url_pncp: string;
  is_downloaded: boolean;
  mime_type?: string | null;
}

interface SearchConfigSummary {
  id: string;
  name: string;
}

let licitacoesCache: Licitacao[] | null = null;
let searchConfigsCache: SearchConfigSummary[] | null = null;
let licitacoesCacheTimestamp: number | null = null;
const LICITACOES_CACHE_TTL_MS = 2 * 60 * 1000;

const DEFAULT_GESTAO_CHECKLIST_ITEMS = [
  { id: 'habilitacao_juridica', label: 'Habilitação jurídica preparada' },
  { id: 'regularidade_fiscal', label: 'Regularidade fiscal e trabalhista ok' },
  { id: 'certidoes_especificas', label: 'Certidões específicas do edital separadas' },
  { id: 'qualificacao_tecnica', label: 'Documentos de qualificação técnica preparados' },
  { id: 'proposta_comercial_montada', label: 'Proposta comercial montada' },
  { id: 'proposta_cadastrada_portal', label: 'Proposta cadastrada no portal' },
  { id: 'anexos_conferidos', label: 'Anexos conferidos no portal' },
  { id: 'revisao_final', label: 'Revisão final feita (4-olhos)' },
] as const;

const STATUS_COLUMNS = [
  { key: 'em_analise', label: 'Em análise' },
  { key: 'preparando_proposta', label: 'Preparando proposta' },
  { key: 'enviada', label: 'Enviada' },
  { key: 'resultado', label: 'Resultado' },
  { key: 'arquivada', label: 'Arquivada' },
] as const;

const getStatusKey = (status?: string | null) => status || 'em_analise';

const PIPELINE_STAGE_META = {
  captada: {
    label: 'Captada',
    className:
      'text-[11px] bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-700',
  },
  analise: {
    label: 'Em análise',
    className:
      'text-[11px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-800',
  },
  preparacao: {
    label: 'Decisão/Preparação',
    className:
      'text-[11px] bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-800',
  },
  aguardando_resultado: {
    label: 'Aguardando resultado',
    className:
      'text-[11px] bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-100 dark:border-violet-800',
  },
  encerrada: {
    label: 'Encerrada',
    className:
      'text-[11px] bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-200 dark:border-zinc-700',
  },
  lixeira: {
    label: 'Lixeira',
    className:
      'text-[11px] bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-800',
  },
} as const;

type PipelineStageKey = keyof typeof PIPELINE_STAGE_META;

const getPipelineStage = (licitacao: Licitacao): PipelineStageKey => {
  const status = licitacao.status_interno;

  if (status === 'arquivada') {
    return 'encerrada';
  }

  if (status === 'lixeira') {
    return 'lixeira';
  }

  if (status === 'resultado' || status === 'enviada') {
    return 'aguardando_resultado';
  }

  if (status === 'preparando_proposta') {
    return 'preparacao';
  }

  if (status === 'em_analise') {
    return 'analise';
  }

  if (licitacao.vai_participar) {
    return 'analise';
  }

  if (
    licitacao.ia_score != null ||
    licitacao.ia_filtrada === true ||
    licitacao.ia_needs_review === false ||
    licitacao.ia_needs_review === true
  ) {
    return 'analise';
  }

  return 'captada';
};

const renderPipelineStageBadge = (stage: PipelineStageKey) => {
  const meta = PIPELINE_STAGE_META[stage];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
};

const PRIORITY_LEVEL_META = {
  alta: {
    label: 'Prioridade alta',
    className:
      'text-[11px] bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-100 dark:border-red-800',
  },
  media: {
    label: 'Prioridade média',
    className:
      'text-[11px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-800',
  },
  baixa: {
    label: 'Prioridade baixa',
    className:
      'text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:border-emerald-700',
  },
} as const;

type PriorityLevel = keyof typeof PRIORITY_LEVEL_META;

interface PriorityInfo {
  level: PriorityLevel;
  score: number;
}

const isHistorico = (licitacao: Licitacao): boolean => {
  const dataEncerramento = licitacao.data_encerramento_proposta;
  if (!dataEncerramento) return false;

  const fim = new Date(dataEncerramento);
  if (Number.isNaN(fim.getTime())) return false;

  const now = new Date();
  return now > fim;
};

const renderPriorityBadge = (priority: PriorityInfo) => {
  const meta = PRIORITY_LEVEL_META[priority.level];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
      <span className="ml-1 text-[10px] text-muted-foreground/80">• {priority.score}</span>
    </Badge>
  );
};

const Licitacoes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { fromAgenda?: boolean } | null;
  const openedFromAgenda = Boolean(locationState?.fromAgenda);
  const { toast } = useToast();
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [searchConfigs, setSearchConfigs] = useState<SearchConfigSummary[]>([]);
  const [activeSearchConfigId, setActiveSearchConfigId] = useState<string | null>(null);
  const [documentos, setDocumentos] = useState<Record<string, Documento[]>>({});
  const [detalhesPncp, setDetalhesPncp] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'todas' | 'participando' | 'ia' | 'ia_descartadas' | 'chat_ia' | 'lixeira' | 'historico'
  >('todas');
  const [modalLicitacao, setModalLicitacao] = useState<Licitacao | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<Record<string, string | null>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isFilteringIa, setIsFilteringIa] = useState(false);
  const [editalIaMap, setEditalIaMap] = useState<Record<string, LicitacaoEditalIA>>({});
  const [processingEdital, setProcessingEdital] = useState<Record<string, boolean>>({});
  const [analiseEditalModalLicitacaoId, setAnaliseEditalModalLicitacaoId] = useState<string | null>(null);
  const [iaConfigLicitacao, setIaConfigLicitacao] = useState<Licitacao | null>(null);
  const [iaConfigCustomUrl, setIaConfigCustomUrl] = useState('');
  const [iaConfigUploadUrl, setIaConfigUploadUrl] = useState<string | null>(null);
  const [iaConfigUploadFileName, setIaConfigUploadFileName] = useState<string | null>(null);
  const [isUploadingIaFile, setIsUploadingIaFile] = useState(false);
  const [chatIaMessages, setChatIaMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatIaInput, setChatIaInput] = useState('');
  const [chatIaLoading, setChatIaLoading] = useState(false);
  const [chatIaFileUrl, setChatIaFileUrl] = useState<string | null>(null);
  const [chatIaFileName, setChatIaFileName] = useState<string | null>(null);
  const [chatIaUploadingFile, setChatIaUploadingFile] = useState(false);
  const [gestaoNotasDraft, setGestaoNotasDraft] = useState<Record<string, string>>({});
  const [pendingLicitacaoIdFromUrl, setPendingLicitacaoIdFromUrl] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();

    const now = Date.now();
    const hasValidCache =
      licitacoesCache &&
      searchConfigsCache &&
      licitacoesCacheTimestamp !== null &&
      now - licitacoesCacheTimestamp < LICITACOES_CACHE_TTL_MS;

    if (hasValidCache) {
      setLicitacoes(licitacoesCache);
      setSearchConfigs(searchConfigsCache);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadLicitacoes();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (
      tabParam === 'todas' ||
      tabParam === 'participando' ||
      tabParam === 'ia' ||
      tabParam === 'ia_descartadas' ||
      tabParam === 'chat_ia' ||
      tabParam === 'lixeira' ||
      tabParam === 'historico'
    ) {
      setActiveTab(tabParam as typeof activeTab);
    }

    const configParam = params.get('config');
    if (configParam) {
      setActiveSearchConfigId(configParam);
    }

    const licitacaoParam = params.get('licitacao');
    if (licitacaoParam) {
      setPendingLicitacaoIdFromUrl(licitacaoParam);
      setIsModalOpen(true);
    }
  }, [location.search]);

  useEffect(() => {
    if (!pendingLicitacaoIdFromUrl || !licitacoes.length) return;
    const lic = licitacoes.find((l) => l.id === pendingLicitacaoIdFromUrl);
    if (!lic) return;

    openModalDetalhes(lic);
    setPendingLicitacaoIdFromUrl(null);
  }, [pendingLicitacaoIdFromUrl, licitacoes]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  }

  const loadAnalisesEdital = async (lista: Licitacao[]) => {
    if (!lista?.length) {
      setEditalIaMap({});
      return;
    }

    try {
      const ids = lista.map((l) => l.id);
      const { data, error } = await (supabase as any)
        .from('licitacao_edital_ia')
        .select('*')
        .in('licitacao_encontrada_id', ids);

      if (error) throw error;

      const map = (data || []).reduce<Record<string, LicitacaoEditalIA>>((acc, item) => {
        acc[item.licitacao_encontrada_id] = item as LicitacaoEditalIA;
        return acc;
      }, {});

      setEditalIaMap(map);
    } catch (error) {
      console.error('Erro ao carregar análises de edital:', error);
    }
  };

  const getGestaoChecklistForLicitacao = (licitacao: Licitacao) => {
    const existing = Array.isArray(licitacao.gestao_checklist) ? licitacao.gestao_checklist : null;

    if (existing && existing.length) {
      return DEFAULT_GESTAO_CHECKLIST_ITEMS.map((def) => {
        const found = existing.find((item) => item.id === def.id);
        return {
          id: def.id,
          label: def.label,
          done: found?.done ?? false,
        };
      });
    }

    return DEFAULT_GESTAO_CHECKLIST_ITEMS.map((def) => ({
      id: def.id,
      label: def.label,
      done: false,
    }));
  };

  const handleToggleChecklistItem = async (licitacaoId: string, itemId: string, done: boolean) => {
    const lic = licitacoes.find((l) => l.id === licitacaoId);
    if (!lic) return;

    const baseChecklist = getGestaoChecklistForLicitacao(lic);
    const updatedChecklist = baseChecklist.map((item) =>
      item.id === itemId ? { ...item, done } : item,
    );

    try {
      const { error } = await (supabase as any)
        .from('licitacoes_encontradas')
        .update({ gestao_checklist: updatedChecklist })
        .eq('id', licitacaoId);

      if (error) throw error;

      setLicitacoes((prev) =>
        prev.map((l) =>
          l.id === licitacaoId ? { ...l, gestao_checklist: updatedChecklist } : l,
        ),
      );

      setModalLicitacao((prev) =>
        prev && prev.id === licitacaoId
          ? { ...prev, gestao_checklist: updatedChecklist }
          : prev,
      );
    } catch (error: any) {
      console.error('Erro ao atualizar checklist de gestão:', error);
      toast({
        title: 'Erro ao salvar checklist',
        description: error?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  };

  const handleEnviarParaLixeira = async (licitacao: Licitacao) => {
    const confirmed = window.confirm(
      'Deseja enviar esta licitação para a lixeira? Ela sairá desta lista e ficará visível na aba "Lixeira".',
    );
    if (!confirmed) return;

    const updates = {
      vai_participar: false,
      ia_needs_review: false,
      ia_filtrada: false,
      status_interno: 'lixeira',
    } as const;

    const optimistic = { ...licitacao, ...updates };
    const previousLicitacoes = licitacoes;
    const previousCache = licitacoesCache ? [...licitacoesCache] : null;

    setLicitacoes((prev) => prev.map((item) => (item.id === licitacao.id ? optimistic : item)));
    if (licitacoesCache) {
      licitacoesCache = licitacoesCache.map((item) => (item.id === licitacao.id ? optimistic : item));
    }
    setModalLicitacao((prev) => (prev && prev.id === licitacao.id ? optimistic : prev));

    try {
      const { error } = await supabase
        .from('licitacoes_encontradas')
        .update(updates)
        .eq('id', licitacao.id);

      if (error) throw error;

      toast({
        title: 'Licitação enviada para a lixeira',
        description: 'Ela agora aparece na aba “Lixeira”.',
      });
    } catch (error: any) {
      console.error('Erro ao enviar licitação para a lixeira:', error);
      toast({
        title: 'Erro ao enviar para a lixeira',
        description: error?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });

      setLicitacoes(previousLicitacoes);
      licitacoesCache = previousCache;
      setModalLicitacao((prev) => (prev && prev.id === licitacao.id ? licitacao : prev));
    }
  };

  const handleChatIaSend = async () => {
    const text = chatIaInput.trim();
    if (!text) return;
    const previousMessages = chatIaMessages;
    const newUserMessage = { role: 'user' as const, content: text };
    setChatIaMessages((prev) => [...prev, newUserMessage]);
    setChatIaInput('');
    setChatIaLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ia-edital-chat', {
        body: {
          pdf_url: chatIaFileUrl || null,
          messages: [...previousMessages, newUserMessage],
        },
      });

      if (error) {
        throw error;
      }

      const explicitError = (data as any)?.error as string | undefined;
      if (explicitError) {
        throw new Error(explicitError);
      }

      const reply = (data as any)?.reply as string | undefined;
      if (!reply) {
        throw new Error('Resposta vazia da IA no chat.');
      }

      const assistantMessage = { role: 'assistant' as const, content: reply };
      setChatIaMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Erro no chat IA do edital:', error);
      toast({
        title: 'Erro no chat IA',
        description: error?.message || 'Não foi possível obter resposta da IA. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setChatIaLoading(false);
    }
  };

  const handleChatIaFileChange = async (e: any) => {
    const file: File | undefined = e.target.files?.[0];

    if (!file) {
      setChatIaFileUrl(null);
      setChatIaFileName(null);
      return;
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: 'Arquivo inválido',
        description: 'Envie um arquivo PDF para o chat.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setChatIaUploadingFile(true);
      const path = `chat/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('edital-uploads')
        .upload(path, file, {
          contentType: file.type || 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('edital-uploads')
        .getPublicUrl(path);

      setChatIaFileUrl(data.publicUrl);
      setChatIaFileName(file.name);
    } catch (error: any) {
      console.error('Erro ao fazer upload do PDF para o chat IA:', error);
      toast({
        title: 'Erro ao enviar PDF',
        description: error?.message || 'Não foi possível enviar o arquivo. Tente novamente.',
        variant: 'destructive',
      });
      setChatIaFileUrl(null);
      setChatIaFileName(null);
    } finally {
      setChatIaUploadingFile(false);
    }
  };

  const renderDetalhesSection = (licitacao: Licitacao, options?: { showStatusControls?: boolean }) => {
    const { showStatusControls = true } = options || {};
    const valorInfo = getValorDisplay(licitacao);
    const valorFallback = detalhesPncp[licitacao.id]
      ? 'Valor não disponibilizado pelo órgão'
      : 'Carregando valor...';
    const notasDraftValue = gestaoNotasDraft[licitacao.id] ?? licitacao.gestao_notas ?? '';
    const analiseIa = editalIaMap[licitacao.id];

    return (
      <div className="space-y-4 pt-4 border-t">
        <div>
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Gestão da Participação
          </h4>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={licitacao.vai_participar ? 'default' : 'outline'}
                disabled={licitacao.vai_participar}
                onClick={async () => {
                  if (licitacao.vai_participar) return;

                  const confirmed = window.confirm(
                    'Confirmar participação nesta licitação? Ela aparecerá na aba "Vou participar".',
                  );
                  if (!confirmed) return;

                  const updates: Record<string, any> = {
                    vai_participar: true,
                  };

                  if (!licitacao.status_interno) {
                    updates.status_interno = 'em_analise';
                  }

                  const { error } = await supabase
                    .from('licitacoes_encontradas')
                    .update(updates)
                    .eq('id', licitacao.id);

                  if (error) {
                    toast({
                      title: 'Erro ao salvar participação',
                      description: error.message,
                      variant: 'destructive',
                    });
                  } else {
                    await loadLicitacoes();
                    toast({
                      title: 'Participação confirmada',
                      description: 'A licitação foi movida para a aba "Vou participar".',
                    });
                  }
                }}
              >
                {licitacao.vai_participar ? 'Participando' : 'Participar desta licitação'}
              </Button>
              {licitacao.vai_participar && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleEnviarParaLixeira(licitacao)}
                  >
                    Remover desta lista
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Esta licitação está na sua lista de participação
                  </span>
                </>
              )}
            </div>

            {showStatusControls && (
              licitacao.vai_participar ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">Status interno</span>
                    <select
                      className="border rounded px-2 py-1 text-sm bg-background"
                      value={licitacao.status_interno || ''}
                      onChange={async (e) => {
                        const value = e.target.value || null;
                        const { error } = await supabase
                          .from('licitacoes_encontradas')
                          .update({ status_interno: value })
                          .eq('id', licitacao.id);

                        if (error) {
                          toast({
                            title: 'Erro ao atualizar status',
                            description: error.message,
                            variant: 'destructive',
                          });
                          return;
                        }

                        const statusLabel = value
                          ? STATUS_COLUMNS.find((col) => col.key === value)?.label || 'Atualizado'
                          : 'Novo';

                        setStatusFeedback((prev) => ({
                          ...prev,
                          [licitacao.id]: `Status interno atualizado: ${statusLabel}.`,
                        }));

                        setLicitacoes((prev) => prev.map((item) => (
                          item.id === licitacao.id
                            ? { ...item, status_interno: value || undefined }
                            : item
                        )));

                        setModalLicitacao((prev) => (
                          prev && prev.id === licitacao.id
                            ? { ...prev, status_interno: value || undefined }
                            : prev
                        ));

                        toast({
                          title: 'Status interno atualizado',
                          description: `Agora está em ${statusLabel}.`,
                        });
                      }}
                    >
                      <option value="">Novo</option>
                      <option value="em_analise">Em análise</option>
                      <option value="preparando_proposta">Preparando proposta</option>
                      <option value="enviada">Enviada</option>
                      <option value="resultado">Resultado</option>
                      <option value="arquivada">Arquivada</option>
                    </select>
                    {statusFeedback[licitacao.id] && (
                      <span className="text-xs text-muted-foreground">
                        {statusFeedback[licitacao.id]}
                      </span>
                    )}
                  </div>

                  {analiseIa && analiseIa.ia_status === 'done' && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAnaliseEditalModalLicitacaoId(licitacao.id)}
                      >
                        Ver análise do edital (IA)
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Marque “Participar desta licitação” para acompanhar o status interno.
                </p>
              )
            )}
          </div>
        </div>

        {licitacao.vai_participar && (
          <div className="bg-muted/40 border rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Checklist da Licitação
            </h4>
            <div className="space-y-1">
              {getGestaoChecklistForLicitacao(licitacao).map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={!!item.done}
                    onChange={(e) =>
                      handleToggleChecklistItem(licitacao.id, item.id, e.target.checked)
                    }
                  />
                  <span
                    className={item.done ? 'line-through text-muted-foreground' : ''}
                  >
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Notas / observações
              </p>
              <Textarea
                value={notasDraftValue}
                onChange={(e) =>
                  setGestaoNotasDraft((prev) => ({
                    ...prev,
                    [licitacao.id]: e.target.value,
                  }))
                }
                placeholder="Anote decisões, pendências ou combinações internas sobre esta licitação..."
                className="text-xs"
                rows={3}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Essas notas são internas e não são enviadas para o PNCP ou para o órgão.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const newValue = notasDraftValue;
                    const currentValue = licitacao.gestao_notas || '';
                    if (newValue === currentValue) {
                      toast({
                        title: 'Nada para salvar',
                        description: 'As notas não foram alteradas.',
                      });
                      return;
                    }

                    try {
                      const { error } = await (supabase as any)
                        .from('licitacoes_encontradas')
                        .update({ gestao_notas: newValue })
                        .eq('id', licitacao.id);

                      if (error) {
                        throw error;
                      }

                      setLicitacoes((prev) =>
                        prev.map((item) =>
                          item.id === licitacao.id ? { ...item, gestao_notas: newValue } : item,
                        ),
                      );

                      setModalLicitacao((prev) =>
                        prev && prev.id === licitacao.id
                          ? { ...prev, gestao_notas: newValue }
                          : prev,
                      );

                      setGestaoNotasDraft((prev) => ({
                        ...prev,
                        [licitacao.id]: newValue,
                      }));

                      toast({
                        title: 'Notas salvas',
                        description: 'As notas desta licitação foram atualizadas.',
                      });
                    } catch (error: any) {
                      console.error('Erro ao salvar notas da licitação:', error);
                      toast({
                        title: 'Erro ao salvar notas',
                        description: error?.message || 'Tente novamente em instantes.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Salvar notas
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-muted/40 border rounded-lg p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Valor estimado
          </p>
          <p className={`text-2xl font-bold ${valorInfo?.highlight ? 'text-primary' : 'text-muted-foreground'}`}>
            {valorInfo?.text ?? valorFallback}
          </p>
        </div>

        <div>
          {detalhesPncp[licitacao.id] && (
            <div className="flex justify-end mb-2">
              {detalhesPncp[licitacao.id].portal?.linkSistemaOrigem && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(detalhesPncp[licitacao.id].portal.linkSistemaOrigem, '_blank')}
                >
                  Acessar Contratação
                </Button>
              )}
            </div>
          )}

          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Detalhes da Licitação
          </h4>
          <div className="text-sm space-y-1">
            <p><span className="font-semibold">Local:</span> {licitacao.municipio_nome}/{licitacao.uf_sigla}</p>
            <p><span className="font-semibold">Órgão:</span> {licitacao.orgao_razao_social}</p>
            <p><span className="font-semibold">Modalidade:</span> {licitacao.modalidade_nome}</p>
            <p><span className="font-semibold">Situação:</span> {detalhesPncp[licitacao.id]?.portal?.situacaoCompraNome ?? 'Divulgada no PNCP'}</p>
            <p>
              <span className="font-semibold">Fonte orçamentária:</span>{' '}
              {Array.isArray(detalhesPncp[licitacao.id]?.portal?.fontesOrcamentarias) && detalhesPncp[licitacao.id].portal.fontesOrcamentarias.length > 0
                ? detalhesPncp[licitacao.id].portal.fontesOrcamentarias.map((f: any) => f.nome || f.descricao || 'Fonte').join(', ')
                : 'Não informada'}
            </p>
            <p><span className="font-semibold">Data de divulgação no PNCP:</span> {formatDate(licitacao.data_publicacao_pncp)}</p>
            {detalhesPncp[licitacao.id]?.portal?.dataAberturaProposta && (
              <p>
                <span className="font-semibold">Data de início de recebimento de propostas:</span>{' '}
                {formatDateTime(detalhesPncp[licitacao.id].portal.dataAberturaProposta)}
              </p>
            )}
            {detalhesPncp[licitacao.id]?.portal?.dataEncerramentoProposta && (
              <p>
                <span className="font-semibold">Data fim de recebimento de propostas:</span>{' '}
                {formatDateTime(detalhesPncp[licitacao.id].portal.dataEncerramentoProposta)}
              </p>
            )}
            <p className="pt-2"><span className="font-semibold">Objeto:</span> {licitacao.objeto_compra}</p>
          </div>
        </div>

        {documentos[licitacao.id]?.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documentos Disponíveis
            </h4>
            <div className="space-y-2">
              {documentos[licitacao.id].map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{doc.tipo_documento_nome}</p>
                      <p className="text-xs text-muted-foreground">{doc.nome_arquivo_pncp}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(doc.url_pncp, '_blank')}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Baixar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {detalhesPncp[licitacao.id]?.itens && Array.isArray(detalhesPncp[licitacao.id].itens) && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Itens da Licitação (PNCP)
            </h4>
            <div className="space-y-2 max-h-64 overflow-auto">
              {detalhesPncp[licitacao.id].itens.map((item: any) => (
                <div
                  key={item.numeroItem}
                  className="flex items-start justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium">
                      {item.numeroItem} - {item.descricao}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Quantidade: {item.quantidade} {item.unidadeMedida}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {detalhesPncp[licitacao.id]?.arquivos && Array.isArray(detalhesPncp[licitacao.id].arquivos) && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Arquivos (PNCP)
            </h4>
            <div className="space-y-2 max-h-64 overflow-auto">
              {detalhesPncp[licitacao.id].arquivos.map((arq: any) => (
                <div
                  key={arq.sequencialDocumento}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex flex-col">
                    <p className="text-sm font-medium">{arq.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {arq.tipoDocumentoNome} • {formatDate(arq.dataPublicacaoPncp)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(arq.url || arq.uri, '_blank')}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Baixar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const loadDetalhesPncp = async (licitacao: Licitacao) => {
    if (detalhesPncp[licitacao.id]) return;

    if (!licitacao.orgao_cnpj) {
      console.warn('Licitacao sem orgao_cnpj, nao foi possivel buscar detalhes PNCP');
      return;
    }

    try {
      // 1) Chamada à Edge Function para itens/arquivos/histórico
      const { data, error } = await supabase.functions.invoke('pncp-detalhes', {
        body: {
          orgao_cnpj: licitacao.orgao_cnpj,
          ano_compra: licitacao.ano_compra,
          numero_compra: licitacao.numero_compra,
          numero_controle_pncp: licitacao.numero_controle_pncp,
        },
      });

      if (error) {
        console.error('Error invoking pncp-detalhes:', error);
      }

      // 2) Chamada direta ao endpoint público de contratação do PNCP (Swagger)
      let portalFromBrowser: any = null;
      try {
        const sequencialNum = Number(String(licitacao.numero_compra).replace(/\D/g, ''));
        if (!Number.isNaN(sequencialNum)) {
          const candidates = [
            sequencialNum.toString().padStart(6, '0'),
            sequencialNum.toString(),
          ];

          for (const seq of candidates) {
            const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${licitacao.orgao_cnpj}/compras/${licitacao.ano_compra}/${seq}`;
            try {
              const resp = await fetch(url, { headers: { Accept: 'application/json' } });
              if (resp.ok) {
                portalFromBrowser = await resp.json();
                break;
              }
            } catch (e) {
              console.error('Erro ao buscar detalhes diretos PNCP no browser:', e);
            }
          }
        }
      } catch (e) {
        console.error('Erro geral ao buscar detalhes diretos PNCP no browser:', e);
      }

      const portalFinal = portalFromBrowser || (data as any)?.portal || null;

      if (portalFinal && (portalFinal.dataEncerramentoProposta || portalFinal.dataAberturaProposta || portalFinal.valorTotalEstimado)) {
        const updates: Record<string, any> = {};
        if (portalFinal.dataEncerramentoProposta && !licitacao.data_encerramento_proposta) {
          updates.data_encerramento_proposta = portalFinal.dataEncerramentoProposta;
        }
        if (portalFinal.dataAberturaProposta && !licitacao.data_abertura_proposta) {
          updates.data_abertura_proposta = portalFinal.dataAberturaProposta;
        }
        if (portalFinal.valorTotalEstimado && (!licitacao.valor_total_estimado || licitacao.valor_total_estimado === 0)) {
          updates.valor_total_estimado = portalFinal.valorTotalEstimado;
        }
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('licitacoes_encontradas')
            .update(updates)
            .eq('id', licitacao.id);

          setLicitacoes((prev) =>
            prev.map((item) =>
              item.id === licitacao.id
                ? {
                  ...item,
                  ...updates,
                }
                : item,
            ),
          );
        }
      }

      setDetalhesPncp((prev) => ({
        ...prev,
        [licitacao.id]: {
          ...(data || {}),
          portal: portalFinal,
        },
      }));
    } catch (error) {
      console.error('Unexpected error invoking pncp-detalhes:', error);
    }
  };

  const loadLicitacoes = async () => {
    try {
      const { data: configs } = await supabase
        .from('search_configurations')
        .select('id, name');

      const configIds = (configs || []).map((c: any) => c.id);

      const configsMapped: SearchConfigSummary[] = (configs || []).map((c: any) => ({
        id: c.id,
        name: c.name || 'Sem nome',
      }));

      setSearchConfigs(configsMapped);
      searchConfigsCache = configsMapped;

      if (configIds.length === 0) {
        setLicitacoes([]);
        licitacoesCache = [];
        licitacoesCacheTimestamp = Date.now();
        await loadAnalisesEdital([]);
        return;
      }

      const { data, error } = await supabase
        .from('licitacoes_encontradas')
        .select('*')
        .in('search_config_id', configIds)
        .order('data_publicacao_pncp', { ascending: false });

      if (error) throw error;
      const lista = (data || []) as any[];

      // Mantemos todas as licitações retornadas. Regras de histórico/ativas
      // são aplicadas apenas nas abas, via função isHistorico.
      setLicitacoes(lista as Licitacao[]);
      licitacoesCache = lista as Licitacao[];
      licitacoesCacheTimestamp = Date.now();
      await loadAnalisesEdital(lista as Licitacao[]);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar licitações',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentos = async (licitacaoId: string) => {
    if (documentos[licitacaoId]) return;

    try {
      const { data, error } = await supabase
        .from('licitacao_documentos_pncp')
        .select('*')
        .eq('licitacao_encontrada_id', licitacaoId);

      if (error) throw error;
      setDocumentos(prev => ({ ...prev, [licitacaoId]: data || [] }));
    } catch (error: any) {
      console.error('Error loading documentos:', error);
    }
  };

  const getSuggestedEditalDocumento = (licitacaoId: string): Documento | null => {
    const docs = documentos[licitacaoId] || [];
    const pdfDocs = docs.filter((doc) => {
      const mime = (doc as any).mime_type?.toLowerCase?.() ?? '';
      const url = doc.url_pncp?.toLowerCase() || '';
      return mime.includes('pdf') || url.endsWith('.pdf') || url.includes('.pdf?');
    });

    const pickByPriority = (list: Documento[]) => {
      if (!list.length) return null;
      return (
        list.find((doc) => /edital/i.test(doc.tipo_documento_nome || '')) ||
        list.find((doc) => /termo|refer[êe]ncia/i.test(doc.tipo_documento_nome || '')) ||
        list[0]
      );
    };

    let chosen = pickByPriority(pdfDocs);
    if (!chosen && docs.length) {
      const docsWithUrl = docs.filter((doc) => !!doc.url_pncp);
      chosen = pickByPriority(docsWithUrl);
    }

    // Fallback: se não houver documentos armazenados na tabela local,
    // tenta sugerir um arquivo diretamente de detalhesPncp.arquivos (PNCP direto).
    if (!chosen) {
      const detalhes = detalhesPncp[licitacaoId];
      const arquivosRaw = detalhes?.arquivos;
      const arquivos: any[] = Array.isArray(arquivosRaw)
        ? arquivosRaw
        : Array.isArray(arquivosRaw?.content)
          ? arquivosRaw.content
          : [];

      const virtualDocs: Documento[] = arquivos
        .map((arq) => {
          const url = arq.url || arq.uri;
          if (!url) return null;

          const lowerUrl = String(url).toLowerCase();
          const fileNameRaw = arq.nomeArquivo || arq.titulo || '';
          const lowerFileName = String(fileNameRaw).toLowerCase();

          const isPdf =
            lowerUrl.endsWith('.pdf') ||
            lowerUrl.includes('.pdf?') ||
            lowerFileName.endsWith('.pdf');

          if (!isPdf) return null;

          return {
            id: String(arq.sequencialDocumento ?? arq.titulo ?? url),
            tipo_documento_nome: arq.tipoDocumentoNome || arq.titulo || 'Arquivo PNCP',
            nome_arquivo_pncp: arq.titulo || arq.nomeArquivo || 'Arquivo PNCP',
            url_pncp: url,
            is_downloaded: false,
          } as Documento;
        })
        .filter(Boolean) as Documento[];

      chosen = pickByPriority(virtualDocs);
    }

    return chosen || null;
  };

  const handleAnalisarEdital = async (licitacaoId: string, uploadUrl?: string) => {
    if (processingEdital[licitacaoId]) return;

    setProcessingEdital((prev) => ({ ...prev, [licitacaoId]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('ia-analisa-edital', {
        body: { licitacao_id: licitacaoId, upload_url: uploadUrl },
      });

      if (error) {
        const backendMessage = (data as any)?.error as string | undefined;
        throw new Error(backendMessage || error.message);
      }

      const explicitError = (data as any)?.error as string | undefined;
      if (explicitError) {
        throw new Error(explicitError);
      }

      await loadAnalisesEdital(licitacoesParticipando);
    } catch (error: any) {
      console.error('Erro ao analisar edital com IA:', error);
      toast({
        title: 'Erro ao analisar edital',
        description: error?.message || 'Tente novamente em alguns instantes.',
        variant: 'destructive',
      });
    } finally {
      setProcessingEdital((prev) => ({ ...prev, [licitacaoId]: false }));
    }
  };

  const openModalDetalhes = async (licitacao: Licitacao) => {
    setModalLicitacao(licitacao);
    setIsModalOpen(true);

    // Carrega dados complementares em segundo plano para não travar a abertura do modal
    if (!documentos[licitacao.id]) {
      loadDocumentos(licitacao.id).catch((error) => {
        console.error('Erro ao carregar documentos da licitação:', error);
      });
    }

    if (!detalhesPncp[licitacao.id]) {
      loadDetalhesPncp(licitacao).catch((error) => {
        console.error('Erro ao carregar detalhes PNCP da licitação:', error);
      });
    }

    try {
      await supabase
        .from('licitacoes_encontradas')
        .update({ is_viewed: true })
        .eq('id', licitacao.id);

      await loadLicitacoes();
    } catch (error) {
      console.error('Erro ao marcar licitação como visualizada:', error);
    }
  };

  const openIaConfigModal = (licitacao: Licitacao) => {
    // Abre o modal imediatamente
    setIaConfigCustomUrl('');
    setIaConfigUploadUrl(null);
    setIaConfigUploadFileName(null);
    setIaConfigLicitacao(licitacao);

    // Carrega documentos em segundo plano, sem travar a abertura do modal
    if (!documentos[licitacao.id]) {
      loadDocumentos(licitacao.id).catch((error) => {
        console.error('Erro ao carregar documentos para IA:', error);
      });
    }

    // Também garante que detalhesPncp (arquivos PNCP) estejam carregados
    if (!detalhesPncp[licitacao.id]) {
      loadDetalhesPncp(licitacao).catch((error) => {
        console.error('Erro ao carregar detalhes PNCP para IA:', error);
      });
    }
  };

  const handleIaUploadFileChange = async (e: any) => {
    const file: File | undefined = e.target.files?.[0];
    if (!iaConfigLicitacao) return;

    if (!file) {
      setIaConfigUploadUrl(null);
      setIaConfigUploadFileName(null);
      return;
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: 'Arquivo inválido',
        description: 'Envie um arquivo PDF para análise do edital.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploadingIaFile(true);
      const path = `${iaConfigLicitacao.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('edital-uploads')
        .upload(path, file, {
          contentType: file.type || 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('edital-uploads')
        .getPublicUrl(path);

      setIaConfigUploadUrl(data.publicUrl);
      setIaConfigUploadFileName(file.name);
    } catch (error: any) {
      console.error('Erro ao fazer upload do PDF do edital:', error);
      toast({
        title: 'Erro ao enviar PDF',
        description: error?.message || 'Não foi possível enviar o arquivo. Tente novamente.',
        variant: 'destructive',
      });
      setIaConfigUploadUrl(null);
      setIaConfigUploadFileName(null);
    } finally {
      setIsUploadingIaFile(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getValorDisplay = (licitacao: Licitacao) => {
    const portal = detalhesPncp[licitacao.id]?.portal;
    const sigiloso = portal?.orcamentoSigilosoCodigo && portal.orcamentoSigilosoCodigo !== 1;
    if (sigiloso) return { text: 'Valor sigiloso', highlight: true };

    const valor = licitacao.valor_total_estimado ?? portal?.valorTotalEstimado;
    if (valor && Number(valor) > 0) {
      return { text: formatCurrency(Number(valor)), highlight: true };
    }
    return null;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const diffDaysFromNow = (date: string | null | undefined) => {
    if (!date) return null;

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const targetDate = new Date(date);
    const today = new Date();

    const diffMs = startOfDay(targetDate) - startOfDay(today);
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const getPriorityInfo = (licitacao: Licitacao): PriorityInfo => {
    const baseDate = licitacao.data_limite_interna || licitacao.data_encerramento_proposta;
    const diasPrazo = diffDaysFromNow(baseDate);

    let prazoScore = 10;
    if (diasPrazo === null) {
      prazoScore = 10;
    } else if (diasPrazo < 0) {
      prazoScore = 60;
    } else if (diasPrazo <= 2) {
      prazoScore = 50;
    } else if (diasPrazo <= 7) {
      prazoScore = 30;
    } else if (diasPrazo <= 14) {
      prazoScore = 15;
    } else {
      prazoScore = 5;
    }

    const valorEstimado = licitacao.valor_total_estimado ?? null;
    let valorScore = 5;
    if (typeof valorEstimado === 'number') {
      if (valorEstimado >= 1_000_000) {
        valorScore = 40;
      } else if (valorEstimado >= 200_000) {
        valorScore = 30;
      } else if (valorEstimado >= 50_000) {
        valorScore = 15;
      } else if (valorEstimado > 0) {
        valorScore = 5;
      }
    }

    let iaScore = 0;
    if (typeof licitacao.ia_score === 'number') {
      if (licitacao.ia_score >= 75) {
        iaScore = 20;
      } else if (licitacao.ia_score >= 50) {
        iaScore = 12;
      } else {
        iaScore = 5;
      }
    } else if (licitacao.ia_filtrada) {
      iaScore = 10;
    } else if (licitacao.ia_needs_review) {
      iaScore = 5;
    }

    const totalScore = Math.round(prazoScore + valorScore + iaScore);
    let level: PriorityLevel = 'baixa';
    if (totalScore >= 80) {
      level = 'alta';
    } else if (totalScore >= 40) {
      level = 'media';
    }

    return { level, score: totalScore };
  };

  const getPncpUrl = (licitacao: Licitacao) => {
    if (licitacao.link_pncp) {
      return licitacao.link_pncp;
    }

    if (licitacao.orgao_cnpj && licitacao.ano_compra && licitacao.numero_compra) {
      return `https://pncp.gov.br/app/compras/${licitacao.orgao_cnpj}/${licitacao.ano_compra}/${licitacao.numero_compra}`;
    }

    return 'https://pncp.gov.br/app/editais';
  };

  const handleBuscarAgora = async () => {
    if (isSearching) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-licitacoes');

      if (error) {
        throw error;
      }

      toast({
        title: 'Busca em andamento',
        description: data?.totalLicitacoesFound
          ? `Encontramos ${data.totalLicitacoesFound} nova(s) licitação(ões).`
          : 'Busca executada com sucesso. Atualizando lista...',
      });

      await loadLicitacoes();
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar licitações',
        description: error?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };
  const handleFiltrarIA = async () => {
    if (isFilteringIa) return;
    setIsFilteringIa(true);
    try {
      const { data, error } = await supabase.functions.invoke('ia-filtrar', {
        body: activeSearchConfigId ? { search_config_id: activeSearchConfigId } : undefined,
      });

      if (error) {
        throw error;
      }

      const processed = (data as any)?.processed ?? 0;

      toast({
        title: 'Filtro de IA executado',
        description: processed
          ? `${processed} licitação(ões) avaliadas pela IA.`
          : 'Nenhuma licitação pendente para análise IA.',
      });

      await loadLicitacoes();
    } catch (error: any) {
      toast({
        title: 'Erro ao executar filtro de IA',
        description: error?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsFilteringIa(false);
    }
  };

  const renderAnaliseEdital = (licitacao: Licitacao) => {
    if (!licitacao.vai_participar) return null;
    const analise = editalIaMap[licitacao.id];
    const isProcessing = processingEdital[licitacao.id];
    const perguntasCliente = (analise as any)?.ia_perguntas_para_cliente
      ?? (analise as any)?.perguntas_para_cliente
      ?? (analise as any)?.ia_raw_json?.perguntas_para_cliente;

    const autoDoc = getSuggestedEditalDocumento(licitacao.id);
    const analiseFonteLabel = (() => {
      if (!analise?.edital_url) return null;
      if (autoDoc && autoDoc.url_pncp === analise.edital_url) {
        return `${autoDoc.tipo_documento_nome || 'Documento PNCP'} (${autoDoc.nome_arquivo_pncp})`;
      }
      return analise.edital_url;
    })();

    return (
      <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            Análise IA do edital
          </p>
          {analise?.edital_url && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => window.open(analise.edital_url!, '_blank')}
            >
              Ver edital
            </Button>
          )}
        </div>

        {!analise && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Ainda não analisamos este edital com IA.
            </p>
            <Button
              size="sm"
              onClick={() => openIaConfigModal(licitacao)}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processando…' : 'Analisar edital com IA'}
            </Button>
          </div>
        )}

        {analise && analise.ia_status === 'processing' && (
          <p className="text-xs text-muted-foreground">
            A IA está analisando o edital… atualize em alguns instantes.
          </p>
        )}

        {analise && analise.ia_status === 'error' && (
          <div className="space-y-2">
            <p className="text-xs text-destructive">
              Erro ao processar o edital: {analise.ia_processing_error}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAnalisarEdital(licitacao.id)}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processando…' : 'Tentar novamente'}
            </Button>
          </div>
        )}

        {analise && analise.ia_status === 'done' && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {typeof analise.ia_score_adequacao === 'number' && (
                  <Badge variant="outline">Score edital: {Math.round(analise.ia_score_adequacao)}</Badge>
                )}
                {analise.ia_recomendacao_participar !== null && (
                  <Badge variant={analise.ia_recomendacao_participar ? 'default' : 'destructive'}>
                    {analise.ia_recomendacao_participar ? 'Recomendado participar' : 'Não recomendado'}
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAnaliseEditalModalLicitacaoId(licitacao.id)}
              >
                Ver análise do edital
              </Button>
            </div>
            {analiseFonteLabel && (
              <p className="text-[11px] text-muted-foreground">
                Analisado com: {analiseFonteLabel}
              </p>
            )}
            {analise.ia_resumo && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {analise.ia_resumo}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleAnalisarEdital(licitacao.id)}
                disabled={isProcessing}
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Reexecutar análise
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAnaliseList = (title: string, itens?: string[] | null) => {
    if (!itens || itens.length === 0) return null;
    return (
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          {itens.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  const licitacoesByConfig =
    activeSearchConfigId
      ? licitacoes.filter((l) => l.search_config_id === activeSearchConfigId)
      : licitacoes;

  const licitacoesHistorico = licitacoesByConfig.filter((l) => isHistorico(l));
  const licitacoesAtivas = licitacoesByConfig.filter((l) => !isHistorico(l));

  const licitacoesParticipandoGlobal = licitacoes.filter((l) => l.vai_participar);
  const licitacoesParticipando = licitacoesAtivas.filter((l) => l.vai_participar);
  const licitacoesDisponiveis = licitacoesAtivas.filter((l) => {
    const isParticipando = l.vai_participar;
    const foiClassificadaNaoRelevante = l.ia_needs_review === false && l.ia_filtrada === false;
    const estaNaLixeira = l.status_interno === 'lixeira';
    return !isParticipando && !foiClassificadaNaoRelevante && !estaNaLixeira;
  });
  const licitacoesIa = licitacoesAtivas.filter((l) => l.ia_filtrada && !l.vai_participar);
  const licitacoesIaDescartadas = licitacoesAtivas.filter(
    (l) => l.ia_needs_review === false && l.ia_filtrada === false && l.status_interno !== 'lixeira',
  );
  const licitacoesLixeira = licitacoesAtivas.filter(
    (l) => l.status_interno === 'lixeira',
  );
  const iaPendentesCount = licitacoesAtivas.filter((l) => l.ia_needs_review === true).length;

  const licitacoesFiltradas =
    activeTab === 'todas'
      ? licitacoesDisponiveis
      : activeTab === 'participando'
        ? licitacoesParticipando
        : activeTab === 'ia'
          ? licitacoesIa
          : activeTab === 'lixeira'
            ? licitacoesLixeira
            : activeTab === 'historico'
              ? licitacoesHistorico
              : licitacoesIaDescartadas;

  const renderParticipandoKanban = () => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {STATUS_COLUMNS.map((column) => {
        const cards = licitacoesParticipandoGlobal.filter((l) => getStatusKey(l.status_interno) === column.key);
        const sortedCards = [...cards].sort(
          (a, b) => getPriorityInfo(b).score - getPriorityInfo(a).score,
        );
        return (
          <div key={column.key} className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{column.label}</span>
              <Badge variant="secondary">{cards.length}</Badge>
            </div>
            <div className="space-y-3 min-h-[120px]">
              {sortedCards.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma licitação nesta etapa.</p>
              ) : (
                sortedCards.map((licitacao) => {
                  const valorInfo = getValorDisplay(licitacao);
                  const priorityInfo = getPriorityInfo(licitacao);
                  const pipelineStage = getPipelineStage(licitacao);
                  const portal = detalhesPncp[licitacao.id]?.portal;
                  const fimProposta = portal?.dataEncerramentoProposta || licitacao.data_encerramento_proposta;
                  const diasRestantes = diffDaysFromNow(fimProposta);
                  return (
                    <Card key={licitacao.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-base leading-tight text-foreground">
                              {licitacao.modalidade_nome} nº {licitacao.numero_compra}/{licitacao.ano_compra}
                            </CardTitle>
                            <div className="flex flex-wrap gap-2">
                              {licitacao.search_config_id && (
                                <Badge variant="secondary" className="text-[11px]">
                                  {(() => {
                                    const config = searchConfigs.find((c) => c.id === licitacao.search_config_id);
                                    return config?.name || 'Busca';
                                  })()}
                                </Badge>
                              )}
                              {renderPipelineStageBadge(pipelineStage)}
                              {renderPriorityBadge(priorityInfo)}
                            </div>
                            <CardDescription className="text-sm leading-snug">
                              {licitacao.orgao_razao_social} - {licitacao.municipio_nome}/{licitacao.uf_sigla}
                            </CardDescription>
                          </div>
                          <div className="text-right">
                            {(() => {
                              const valorInfo = getValorDisplay(licitacao);
                              if (valorInfo) {
                                return (
                                  <p className="text-lg font-bold text-primary">
                                    {valorInfo.text}
                                  </p>
                                );
                              }
                              return (
                                <p className="text-xs text-muted-foreground">
                                  Clique em Detalhes para carregar o valor.
                                </p>
                              );
                            })()}
                            <p className="text-xs text-muted-foreground">
                              Publicado em {formatDate(licitacao.data_publicacao_pncp)}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-3">{licitacao.objeto_compra}</p>
                        {licitacao.data_encerramento_proposta && (
                          <p className="text-xs text-muted-foreground mb-1">
                            Encerramento: {formatDate(licitacao.data_encerramento_proposta)}
                          </p>
                        )}
                        {diasRestantes !== null && (
                          <p className="text-[11px] text-muted-foreground mb-1">
                            {diasRestantes > 0
                              ? `Faltam ${diasRestantes} dia(s) para cadastrar a proposta.`
                              : diasRestantes === 0
                                ? 'Hoje é o último dia para cadastrar a proposta.'
                                : `Prazo encerrou há ${Math.abs(diasRestantes)} dia(s).`}
                          </p>
                        )}
                        {(() => {
                          const checklist = getGestaoChecklistForLicitacao(licitacao);
                          const total = checklist.length;
                          const doneCount = checklist.filter((item) => item.done).length;
                          if (!total) return null;
                          return (
                            <p className="text-[11px] text-muted-foreground mb-3">
                              Checklist: {doneCount}/{total} itens concluídos
                            </p>
                          );
                        })()}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => openModalDetalhes(licitacao)}>
                            <Eye className="mr-2 h-3 w-3" />
                            Detalhes
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(getPncpUrl(licitacao), '_blank')}
                          >
                            <ExternalLink className="mr-2 h-3 w-3" />
                            PNCP
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => handleEnviarParaLixeira(licitacao)}
                          >
                            Remover
                          </Button>
                        </div>
                        {renderAnaliseEdital(licitacao)}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderListaDefault = () => {
    const orderedLicitacoes = [...licitacoesFiltradas].sort(
      (a, b) => getPriorityInfo(b).score - getPriorityInfo(a).score,
    );

    return (
      <div className="grid gap-4">
        {orderedLicitacoes.map((licitacao) => {
          const priorityInfo = getPriorityInfo(licitacao);
          return (
            <Card key={licitacao.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="space-y-1">
                      <CardTitle className="text-lg leading-tight text-foreground">
                        {licitacao.modalidade_nome} nº {licitacao.numero_compra}/{licitacao.ano_compra}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        {!licitacao.is_viewed && <Badge className="bg-primary">NOVA</Badge>}
                        {licitacao.vai_participar && (
                          <Badge variant="outline" className="text-xs">
                            Participando
                          </Badge>
                        )}
                        {licitacao.search_config_id && (
                          <Badge variant="secondary" className="text-[11px]">
                            {(() => {
                              const config = searchConfigs.find((c) => c.id === licitacao.search_config_id);
                              return config?.name || 'Busca';
                            })()}
                          </Badge>
                        )}
                        {renderPipelineStageBadge(getPipelineStage(licitacao))}
                        {renderPriorityBadge(priorityInfo)}
                      </div>
                    </div>
                    <CardDescription className="leading-snug">
                      {licitacao.orgao_razao_social} - {licitacao.municipio_nome}/{licitacao.uf_sigla}
                    </CardDescription>
                  </div>
                  <div className="text-right md:min-w-[160px]">
                    {(() => {
                      const valorInfo = getValorDisplay(licitacao);
                      if (valorInfo) {
                        return (
                          <p className="text-lg font-bold text-primary">
                            {valorInfo.text}
                          </p>
                        );
                      }
                      return (
                        <p className="text-xs text-muted-foreground">
                          Clique em Detalhes para carregar o valor.
                        </p>
                      );
                    })()}
                    <p className="text-xs text-muted-foreground">
                      Publicado em {formatDate(licitacao.data_publicacao_pncp)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-2 line-clamp-3">{licitacao.objeto_compra}</p>
                {licitacao.data_encerramento_proposta && (
                  <p className="text-xs text-muted-foreground mb-1">
                    Encerramento: {formatDate(licitacao.data_encerramento_proposta)}
                  </p>
                )}
                {licitacao.data_encerramento_proposta && (
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {diffDaysFromNow(licitacao.data_encerramento_proposta) > 0
                      ? `Faltam ${diffDaysFromNow(licitacao.data_encerramento_proposta)} dia(s) para cadastrar a proposta.`
                      : diffDaysFromNow(licitacao.data_encerramento_proposta) === 0
                        ? 'Hoje é o último dia para cadastrar a proposta.'
                        : `Prazo encerrou há ${Math.abs(diffDaysFromNow(licitacao.data_encerramento_proposta))} dia(s).`}
                  </p>
                )}
                {(() => {
                  const checklist = getGestaoChecklistForLicitacao(licitacao);
                  const total = checklist.length;
                  const doneCount = checklist.filter((item) => item.done).length;
                  if (!total) return null;
                  return (
                    <p className="text-[11px] text-muted-foreground mb-3">
                      Checklist: {doneCount}/{total} itens concluídos
                    </p>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openModalDetalhes(licitacao)}>
                    <Eye className="mr-2 h-3 w-3" />
                    Detalhes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(getPncpUrl(licitacao), '_blank')}
                  >
                    <ExternalLink className="mr-2 h-3 w-3" />
                    PNCP
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleEnviarParaLixeira(licitacao)}
                  >
                    Remover
                  </Button>
                </div>
                {renderAnaliseEdital(licitacao)}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderEmptyState = () => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-2">
          {activeTab === 'todas'
            ? 'Nenhuma licitação disponível no momento'
            : activeTab === 'participando'
              ? 'Nenhuma licitação marcada para participar'
              : activeTab === 'ia'
                ? 'Nenhuma licitação marcada como relevante pela IA'
                : activeTab === 'lixeira'
                  ? 'Nenhuma licitação na lixeira'
                  : 'Nenhuma licitação descartada pela IA'}
        </p>
        <p className="text-sm text-muted-foreground">
          {activeTab === 'todas'
            ? 'Configure suas buscas e aguarde a execução automática'
            : activeTab === 'participando'
              ? 'Volte para a aba Todas para escolher novas licitações'
              : activeTab === 'ia'
                ? 'Clique em “Filtrar com IA” para que a IA avalie as licitações recentes.'
                : activeTab === 'lixeira'
                  ? 'As licitações que você envia para a lixeira ficam armazenadas aqui.'
                  : 'Estas são licitações avaliadas e consideradas não aderentes ao seu perfil pela IA.'}
        </p>
      </CardContent>
    </Card>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (activeTab === 'chat_ia') {
      const mensagens = chatIaMessages;
      const loading = chatIaLoading;

      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Chat IA livre</CardTitle>
                <CardDescription className="text-xs">
                  Converse livremente com a IA e, se quiser, anexe um PDF para ela ler durante a conversa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Separator className="my-2" />
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold">PDF para o chat</p>
                  <p className="text-[11px] text-muted-foreground">
                    Envie um arquivo PDF (por exemplo, um edital) para que a IA possa ler o conteúdo durante a conversa.
                  </p>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleChatIaFileChange}
                    className="text-[11px]"
                    disabled={chatIaUploadingFile}
                  />
                  {chatIaFileName && (
                    <p className="text-[11px] text-muted-foreground">
                      Arquivo selecionado: {chatIaFileName}
                    </p>
                  )}
                  {!chatIaFileName && (
                    <p className="text-[11px] text-muted-foreground">
                      Nenhum PDF selecionado ainda.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="md:col-span-2 flex flex-col h-[60vh] border rounded-lg">
            <div className="flex-1 overflow-auto p-3 space-y-2 bg-muted/40">
              {mensagens.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Comece a conversa explicando para a IA como você quer que ela leia o edital. Exemplo: "Você receberá um edital em PDF. Responda em português e foque nos documentos de habilitação e riscos para a empresa".
                </p>
              )}
              {mensagens.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] rounded-md px-3 py-2 text-xs whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'mr-auto bg-background border'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <p className="text-[11px] text-muted-foreground">IA está respondendo…</p>
              )}
            </div>
            <div className="border-t p-3 flex flex-col gap-2">
              <Textarea
                rows={2}
                placeholder="Escreva sua mensagem para a IA sobre este edital..."
                value={chatIaInput}
                onChange={(e) => setChatIaInput(e.target.value)}
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleChatIaSend()}
                  disabled={loading || !chatIaInput.trim()}
                >
                  Enviar mensagem
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'participando') {
      if (licitacoesParticipandoGlobal.length === 0) {
        return renderEmptyState();
      }
      return renderParticipandoKanban();
    }

    if (licitacoesFiltradas.length === 0) {
      return renderEmptyState();
    }

    return renderListaDefault();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Licitações Encontradas</h1>
          <div className="ml-auto flex items-center gap-3">
            {(isSearching || isFilteringIa) && (
              <span className="text-sm text-muted-foreground">
                {isSearching ? 'Buscando licitações…' : 'Filtrando com IA…'}
              </span>
            )}
            <Button
              size="sm"
              onClick={handleBuscarAgora}
              disabled={isSearching}
              variant={isSearching ? 'ghost' : 'default'}
            >
              {isSearching ? 'Buscando…' : 'Buscar agora'}
            </Button>
            <Button
              size="sm"
              onClick={handleFiltrarIA}
              disabled={isFilteringIa}
              variant={isFilteringIa ? 'ghost' : 'outline'}
            >
              {isFilteringIa ? 'Filtrando…' : 'Filtrar com IA'}
            </Button>
          </div>
        </div>
        {(isSearching || isFilteringIa) && <Progress value={70} className="h-1 rounded-none" />}
      </header>

      <main className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Licitações</h2>
            <p className="text-muted-foreground text-sm">
              {licitacoesDisponiveis.length} disponíveis • {licitacoesParticipandoGlobal.length} vou participar • {licitacoesIa.length} IA relevantes • {licitacoesIaDescartadas.length} IA descartadas • {licitacoesLixeira.length} na lixeira • {licitacoesHistorico.length} no histórico
            </p>
            {iaPendentesCount > 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                IA em progresso: {iaPendentesCount} licitação(ões) ainda serão avaliadas.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Todas as licitações já foram avaliadas pela IA.
              </p>
            )}
            {activeSearchConfigId && (
              <p className="text-xs text-muted-foreground mt-1">
                Filtrando pela busca:{' '}
                {(() => {
                  const config = searchConfigs.find((c) => c.id === activeSearchConfigId);
                  return config?.name || 'Busca';
                })()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'todas' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('todas')}
            >
              Todas
            </Button>
            <Button
              variant={activeTab === 'participando' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('participando')}
            >
              Vou participar
            </Button>
            <Button
              variant={activeTab === 'ia' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('ia')}
            >
              IA
            </Button>
            <Button
              variant={activeTab === 'ia_descartadas' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('ia_descartadas')}
            >
              Descartadas IA
            </Button>
            <Button
              variant={activeTab === 'lixeira' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('lixeira')}
            >
              Lixeira
            </Button>
            <Button
              variant={activeTab === 'chat_ia' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('chat_ia')}
            >
              Chat IA
            </Button>
            <Button
              variant={activeTab === 'historico' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('historico')}
            >
              Histórico
            </Button>
          </div>
        </div>

        {searchConfigs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar por configuração de busca:</span>
            <Button
              size="xs"
              variant={activeSearchConfigId ? 'outline' : 'default'}
              onClick={() => setActiveSearchConfigId(null)}
            >
              Todas as buscas
            </Button>
            {searchConfigs.map((config) => (
              <Button
                key={config.id}
                size="xs"
                variant={activeSearchConfigId === config.id ? 'default' : 'outline'}
                onClick={() => setActiveSearchConfigId(config.id)}
              >
                {config.name}
              </Button>
            ))}
          </div>
        )}

        {renderContent()}
      </main>

      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open);
        if (!open) {
          setModalLicitacao(null);
          setPendingLicitacaoIdFromUrl(null);
          if (openedFromAgenda) {
            navigate('/agenda');
          }
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {modalLicitacao ? (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-bold">
                      {modalLicitacao.modalidade_nome} nº {modalLicitacao.numero_compra}/{modalLicitacao.ano_compra}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {modalLicitacao.orgao_razao_social} - {modalLicitacao.municipio_nome}/{modalLicitacao.uf_sigla}
                    </span>
                  </div>
                  {modalLicitacao.link_pncp && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap text-xs"
                      onClick={() => window.open(modalLicitacao.link_pncp, '_blank')}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      Ver no PNCP
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">Carregando detalhes da licitação…</span>
                  <span className="text-xs text-muted-foreground">
                    Buscando informações no PNCP e na sua lista de licitações.
                  </span>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          {modalLicitacao ? (
            renderDetalhesSection(modalLicitacao)
          ) : (
            <div className="py-6 text-sm text-muted-foreground">
              Carregando dados da licitação selecionada...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {(() => {
        const lic = iaConfigLicitacao;
        const autoDoc = lic ? getSuggestedEditalDocumento(lic.id) : null;

        return (
          <Dialog
            open={!!lic}
            onOpenChange={(open) => {
              if (!open) {
                setIaConfigLicitacao(null);
                setIaConfigCustomUrl('');
                setIaConfigUploadUrl(null);
                setIaConfigUploadFileName(null);
              }
            }}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>
                  {lic && (
                    <div className="flex flex-col gap-1">
                      <span className="text-lg font-bold">
                        Configurar análise IA do edital
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {lic.modalidade_nome} nº {lic.numero_compra}/{lic.ano_compra} — {lic.orgao_razao_social} ({lic.municipio_nome}/{lic.uf_sigla})
                      </span>
                    </div>
                  )}
                </DialogTitle>
              </DialogHeader>

              {lic && (
                <div className="space-y-4 text-sm">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs font-semibold mb-1">Documento sugerido para análise automática</p>
                    {autoDoc ? (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs">
                          <p className="font-medium">{autoDoc.tipo_documento_nome || 'Documento PNCP'}</p>
                          <p className="text-muted-foreground break-all">{autoDoc.nome_arquivo_pncp}</p>
                        </div>
                        {autoDoc.url_pncp && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(autoDoc.url_pncp, '_blank')}
                          >
                            <ExternalLink className="mr-2 h-3 w-3" />
                            Abrir documento
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum documento elegível encontrado automaticamente nos arquivos do PNCP.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold">URL de PDF para enviar à IA (opcional)</p>
                    <p className="text-[11px] text-muted-foreground">
                      Se você informar uma URL de PDF pública, ela será usada no lugar do documento sugerido acima.
                      Caso deixe em branco, a função usará o documento sugerido (quando existir).
                    </p>
                    <Input
                      placeholder="https://exemplo.com/edital.pdf"
                      value={iaConfigCustomUrl}
                      onChange={(e) => setIaConfigCustomUrl(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold">Ou enviar PDF manualmente</p>
                    <p className="text-[11px] text-muted-foreground">
                      O arquivo será enviado para o Storage (bucket "edital-uploads") e a URL gerada será usada na análise.
                    </p>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleIaUploadFileChange}
                      className="text-xs"
                    />
                    {iaConfigUploadFileName && (
                      <p className="text-[11px] text-muted-foreground">
                        Arquivo selecionado: {iaConfigUploadFileName}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIaConfigLicitacao(null);
                        setIaConfigCustomUrl('');
                        setIaConfigUploadUrl(null);
                        setIaConfigUploadFileName(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!lic) return;
                        const trimmed = iaConfigCustomUrl.trim();
                        const uploadUrl = iaConfigUploadUrl || trimmed || autoDoc?.url_pncp || undefined;
                        await handleAnalisarEdital(lic.id, uploadUrl);
                        setIaConfigLicitacao(null);
                        setIaConfigCustomUrl('');
                        setIaConfigUploadUrl(null);
                        setIaConfigUploadFileName(null);
                      }}
                      disabled={processingEdital[lic?.id || ''] || isUploadingIaFile}
                    >
                      Iniciar análise com IA
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}

      {(() => {
        const analiseModalLicitacao = analiseEditalModalLicitacaoId
          ? licitacoes.find((l) => l.id === analiseEditalModalLicitacaoId)
          : null;
        const analiseModal = analiseModalLicitacao
          ? editalIaMap[analiseModalLicitacao.id]
          : null;
        const perguntasClienteModal = (analiseModal as any)?.ia_perguntas_para_cliente
          ?? (analiseModal as any)?.perguntas_para_cliente
          ?? (analiseModal as any)?.ia_raw_json?.perguntas_para_cliente;

        const autoDocModal = analiseModalLicitacao
          ? getSuggestedEditalDocumento(analiseModalLicitacao.id)
          : null;
        const analiseFonteLabelModal = (() => {
          if (!analiseModal?.edital_url) return null;
          if (autoDocModal && autoDocModal.url_pncp === analiseModal.edital_url) {
            return `${autoDocModal.tipo_documento_nome || 'Documento PNCP'} (${autoDocModal.nome_arquivo_pncp})`;
          }
          return analiseModal.edital_url;
        })();

        return (
          <Dialog
            open={!!analiseEditalModalLicitacaoId && !!analiseModalLicitacao && !!analiseModal}
            onOpenChange={(open) => {
              if (!open) {
                setAnaliseEditalModalLicitacaoId(null);
              }
            }}
          >
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>
                  {analiseModal && (
                    <div className="flex flex-col gap-1">
                      <span className="text-lg font-bold">
                        Análise IA do edital - {analiseModalLicitacao.modalidade_nome} nº {analiseModalLicitacao.numero_compra}/{analiseModalLicitacao.ano_compra}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {analiseModalLicitacao.orgao_razao_social} - {analiseModalLicitacao.municipio_nome}/{analiseModalLicitacao.uf_sigla}
                      </span>
                      {analiseFonteLabelModal && (
                        <span className="text-[11px] text-muted-foreground">
                          Analisado com: {analiseFonteLabelModal}
                        </span>
                      )}
                    </div>
                  )}
                </DialogTitle>
              </DialogHeader>
              {analiseModal && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {typeof analiseModal.ia_score_adequacao === 'number' && (
                        <Badge variant="outline">Score edital: {Math.round(analiseModal.ia_score_adequacao)}</Badge>
                      )}
                      {analiseModal.ia_recomendacao_participar !== null && (
                        <Badge variant={analiseModal.ia_recomendacao_participar ? 'default' : 'destructive'}>
                          {analiseModal.ia_recomendacao_participar ? 'Recomendado participar' : 'Não recomendado'}
                        </Badge>
                      )}
                    </div>
                    {analiseModal.edital_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(analiseModal.edital_url!, '_blank')}
                      >
                        <ExternalLink className="mr-2 h-3 w-3" />
                        Ver edital
                      </Button>
                    )}
                  </div>

                  {analiseModal.ia_resumo && (
                    <div>
                      <p className="text-xs font-semibold mb-1">Resumo geral</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{analiseModal.ia_resumo}</p>
                    </div>
                  )}

                  {analiseModal.ia_justificativa && (
                    <div>
                      <p className="text-xs font-semibold mb-1">Justificativa da recomendação</p>
                      <p className="text-xs whitespace-pre-line">{analiseModal.ia_justificativa}</p>
                    </div>
                  )}

                  {renderAnaliseList('Requisitos obrigatórios', analiseModal.ia_requisitos_obrigatorios)}
                  {renderAnaliseList('Documentos exigidos', analiseModal.ia_documentos_exigidos)}
                  {renderAnaliseList('Riscos / pontos de atenção', analiseModal.ia_riscos)}
                  {renderAnaliseList('Perguntas para decisão interna', perguntasClienteModal)}

                  <div className="flex flex-wrap gap-2 pt-2">
                    {analiseModalLicitacao && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAnalisarEdital(analiseModalLicitacao.id)}
                        disabled={processingEdital[analiseModalLicitacao.id]}
                      >
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Reexecutar análise
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
};

export default Licitacoes;
