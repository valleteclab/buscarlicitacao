import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_MODALITIES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const PAGE_SIZE = 25;
const MAX_PAGES_PER_MODALITY = 5;
const STATUS_POSITIVE_KEYWORDS = ['divulg', 'receb', 'propost', 'abert'];
const STATUS_NEGATIVE_KEYWORDS = ['anulad', 'revog', 'homolog', 'encerr', 'conclu', 'suspens'];

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'meta-llama/llama-3.1-8b-instruct';

interface IAClassificationResult {
  score: number;
  justificativa: string;
  relevante: boolean;
  tags?: string[];
}

const buildPrompt = (licitacao: Record<string, any>, config: Record<string, any>) => {
  const resumo = {
    numero_controle_pncp: licitacao.numero_controle_pncp,
    numero_compra: licitacao.numero_compra,
    ano_compra: licitacao.ano_compra,
    modalidade: licitacao.modalidade_nome,
    objeto: licitacao.objeto_compra,
    valor_total_estimado: licitacao.valor_total_estimado,
    data_publicacao: licitacao.data_publicacao_pncp,
    data_encerramento: licitacao.data_encerramento_proposta,
    local:
      licitacao.municipio_nome && licitacao.uf_sigla
        ? `${licitacao.municipio_nome}/${licitacao.uf_sigla}`
        : licitacao.uf_sigla,
    orgao: licitacao.orgao_razao_social,
  };

  const keywords = Array.isArray(config?.keywords) ? config.keywords.join(', ') : 'não informadas';
  const states = Array.isArray(config?.states) ? config.states.join(', ') : 'não definidos';

  return `Você é um analista especialista em licitações e deve indicar se a oportunidade a seguir é relevante
para o usuário com base nas palavras-chave e estados configurados.

REGRAS GERAIS:
- Atribua um score de 0 a 100 (quanto mais alto, mais relevante).
- Considere aderência do objeto, modalidade, região e contexto geral.
- Responda APENAS com JSON válido (sem texto extra).
- Campos obrigatórios do JSON de resposta: {
    "score": number,
    "justificativa": string,
    "relevante": boolean,
    "tags": string[] opcional
  }

REGRAS SOBRE PALAVRAS-CHAVE:
- NUNCA afirme que uma palavra-chave está presente se ela NÃO aparecer claramente no texto da licitação
  (objeto ou descrição dos itens) ou em um sinônimo MUITO óbvio.
- Se nenhuma palavra-chave (nem sinônimos óbvios) for encontrada no texto, defina:
    "relevante": false
    "score": no máximo 30
- Na justificativa, explique sempre quais palavras-chave encontrou e em qual parte do texto;
  se não encontrou nenhuma, diga explicitamente que nenhuma palavra-chave foi encontrada.

REGRAS SOBRE ESTADO/REGIÃO:
- Estados prioritários aumentam o score apenas se o conteúdo também for aderente às palavras-chave.
- Nunca classifique como relevante apenas porque o estado é prioritário.

- "relevante" deve ser true somente quando a licitação aparentar encaixar bem no contexto do usuário.

Contexto do usuário:
- Palavras-chave: ${keywords}
- Estados prioritários: ${states}

Licitação:
${JSON.stringify(resumo, null, 2)}
`;
};

const extractJson = (text: string): IAClassificationResult => {
  const codeBlockMatch = text.match(/```json([\s\S]*?)```/i);
  const raw = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('Resposta do modelo não contém JSON válido.');
  }

  const jsonString = raw.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(jsonString);

  if (
    typeof parsed.score !== 'number' ||
    typeof parsed.justificativa !== 'string' ||
    typeof parsed.relevante !== 'boolean'
  ) {
    throw new Error('JSON retornado não contém os campos esperados.');
  }

  return parsed as IAClassificationResult;
};

const callOpenRouter = async (prompt: string): Promise<IAClassificationResult> => {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY não configurada');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://buscalicitacao.local',
      'X-Title': 'BuscaLicitacao IA Filter',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Você é um analista especialista em licitações brasileiras. Sempre responda APENAS em JSON válido, sem texto extra. Nunca invente informações.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API OpenRouter: ${response.status} - ${errorText}`);
  }

  const json = await response.json();
  const choices = json?.choices;
  const firstChoice = Array.isArray(choices) && choices.length > 0 ? choices[0] : null;
  const message = firstChoice?.message;
  const text = message && typeof message.content === 'string' ? (message.content as string) : '';

  if (!text) {
    console.warn('Resposta vazia ou inválida da OpenRouter, raw response (trunc):', JSON.stringify(json).slice(0, 1000));
    return {
      score: 0,
      justificativa: 'Resposta vazia ou inválida da IA; classificado automaticamente como não relevante.',
      relevante: false,
      tags: ['fallback', 'invalid_response'],
    } satisfies IAClassificationResult;
  }

  return extractJson(text);
};

const classifyLicitacaoComIA = async (
  supabase: ReturnType<typeof createClient>,
  licitacao: Record<string, any>,
  config: Record<string, any>,
) => {
  if (!OPENROUTER_API_KEY) {
    return;
  }

  try {
    const prompt = buildPrompt(licitacao, config);
    const classification = await callOpenRouter(prompt);

    await supabase
      .from('licitacoes_encontradas')
      .update({
        ia_score: classification.score,
        ia_justificativa: classification.justificativa,
        ia_filtrada: classification.relevante,
        ia_reviewed_at: new Date().toISOString(),
        ia_needs_review: false,
        ia_processing_error: null,
      })
      .eq('id', licitacao.id);
  } catch (error: any) {
    console.error('Erro ao classificar licitação recém inserida', licitacao.id, error?.message || error);
    await supabase
      .from('licitacoes_encontradas')
      .update({
        ia_processing_error: error?.message || 'Erro na classificação automática',
        ia_reviewed_at: new Date().toISOString(),
        ia_needs_review: true,
      })
      .eq('id', licitacao.id);
  }
};

interface PNCPLicitacao {
  numeroControlePNCP: string;
  numeroCompra: string;
  anoCompra: number;
  dataPublicacaoPncp: string;
  objetoCompra: string;
  valorTotalEstimado: number;
  modalidadeNome: string;
  situacaoCompraNome: string;
  dataAberturaProposta?: string;
  dataEncerramentoProposta?: string;
  orgaoEntidade: {
    cnpj: string;
    razaoSocial: string;
  };
  unidadeOrgao: {
    nomeUnidade: string;
    municipioNome: string;
    ufSigla: string;
  };
}

interface PNCPDocumento {
  tipo: number;
  tipoDocumentoNome: string;
  nomeArquivo: string;
  dataInclusao: string;
  urlArquivo: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting search-licitacoes function');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all active search configurations
    const configsResult = await supabase
      .from('search_configurations')
      .select('*')
      .eq('is_active', true);

    if (!configsResult) {
      throw new Error('Supabase returned no response when fetching search_configurations');
    }

    if (configsResult.error) {
      throw configsResult.error;
    }

    const configs = configsResult.data || [];

    console.log(`Found ${configs.length || 0} active search configurations`);

    let totalLicitacoesFound = 0;

    for (const config of configs) {
      console.log(`Processing config: ${config.name} (${config.id})`);
      console.log('Config filters:', {
        states: config.states,
        keywords: config.keywords,
        modalidades: config.modalidades,
      });

      const logParams = {
        states: (config.states as string[] | null) ?? [],
        keywords: (config.keywords as string[] | null) ?? [],
        modalidades: (config.modalidades as number[] | null) ?? [],
      };

      let configResultsCount = 0;
      let configError: string | null = null;

      try {
        // Monta chamada para a API de busca do PNCP (mesma usada pelo portal): /api/search
        const searchBaseUrl = 'https://pncp.gov.br/api/search/';

        const configStates = logParams.states as string[];
        const ufsParam = configStates.length > 0 ? configStates.join(',') : '';

        const configKeywords = logParams.keywords as string[];
        const searchTerms = configKeywords.length > 0 ? configKeywords : [''];

        const modalidadesConfig = logParams.modalidades as number[];
        const modalidadesParam = modalidadesConfig.length > 0
          ? modalidadesConfig.join(',')
          : '';

        const PAGE_SIZE = 50;

        for (const rawTerm of searchTerms) {
          const q = String(rawTerm || '').trim();
          console.log(`Starting PNCP search for keyword "${q || '(vazio)'}"`);

          let page = 1;
          let fetchedSoFar = 0;
          let totalFromApi = 0;

          while (true) {
            const searchParams = new URLSearchParams({
              q,
              tipos_documento: 'edital',
              ordenacao: '-data',
              pagina: String(page),
              tam_pagina: String(PAGE_SIZE),
              status: 'recebendo_proposta',
            });

            if (ufsParam) {
              searchParams.append('ufs', ufsParam);
            }

            if (modalidadesParam) {
              searchParams.append('modalidades', modalidadesParam);
            }

            console.log(`Fetching from PNCP search API: ${searchBaseUrl}?${searchParams.toString()}`);

            const pncpResponse = await fetch(`${searchBaseUrl}?${searchParams.toString()}`, {
              headers: {
                'Accept': 'application/json',
              },
            });

            if (!pncpResponse.ok) {
              let errorText = '';
              try {
                errorText = await pncpResponse.text();
              } catch (_) {
                errorText = '';
              }
              const message = `PNCP search API error (page ${page}): ${pncpResponse.status} ${errorText ? '- ' + errorText : ''}`;
              console.error(message);
              configError = message;
              break;
            }

            const pncpData = await pncpResponse.json();
            const items: any[] = (pncpData.items ?? []) as any[];
            totalFromApi = pncpData.total ?? totalFromApi ?? 0;

            console.log(`Found ${items.length} items from PNCP search API (page=${page}, total=${totalFromApi})`);

            if (items.length === 0) {
              break;
            }

            if (page === 1 && items.length > 0) {
              try {
                const first = items[0] as any;
                console.log('Sample search item keys:', Object.keys(first));
                console.log('Sample search item raw:', JSON.stringify(first).slice(0, 1000));
              } catch (e) {
                console.log('Error logging sample search item', e);
              }
            }

            // A API search já aplica q, status=recebendo_proposta, ufs e modalidades.
            // Aqui não aplicamos filtros adicionais, apenas seguimos o resultado.
            const filteredLicitacoes = items;

            console.log(`${filteredLicitacoes.length} licitacoes match search API filters on page ${page} (already filtered by PNCP)`);

            // Save licitacoes to database
            for (const lic of filteredLicitacoes) {
              const numeroControle = lic.numero_controle_pncp as string | undefined;

              if (!numeroControle) {
                console.log('Skipping item without numero_controle_pncp');
                continue;
              }

              // A API de busca retorna item_url começando com "/compras/...".
              // O portal exibe os detalhes em "/app/editais/...", então ajustamos o caminho.
              const itemUrl: string = lic.item_url || '';
              const adjustedPath = itemUrl.startsWith('/compras/')
                ? itemUrl.replace('/compras/', '/editais/')
                : itemUrl;
              const linkPNCP = `https://pncp.gov.br/app${adjustedPath}`;

              // Check if already exists (avoid .single())
              const existingQuery = await supabase
                .from('licitacoes_encontradas')
                .select('id')
                .eq('numero_controle_pncp', numeroControle)
                .limit(1);

              if (existingQuery && existingQuery.error) {
                console.error('Error checking existing licitacao:', existingQuery.error);
              }

              const existingRows = existingQuery && existingQuery.data
                ? (existingQuery.data as any[])
                : [];

              if (existingRows.length > 0) {
                console.log(`Licitacao ${numeroControle} already exists`);
                continue;
              }

              try {
                const insertQuery = await supabase
                  .from('licitacoes_encontradas')
                  .insert({
                    search_config_id: config.id,
                    numero_controle_pncp: numeroControle,
                    numero_compra: lic.numero_sequencial ?? null,
                    ano_compra: lic.ano ? Number(lic.ano) : null,
                    objeto_compra: lic.description ?? lic.title ?? '',
                    modalidade_nome: lic.modalidade_licitacao_nome ?? null,
                    situacao: lic.situacao_nome ?? null,
                    valor_total_estimado: lic.valor_global ?? null,
                    data_abertura_proposta: null,
                    data_encerramento_proposta: null,
                    data_publicacao_pncp: lic.data_publicacao_pncp ?? null,
                    orgao_cnpj: lic.orgao_cnpj ?? null,
                    orgao_razao_social: lic.orgao_nome ?? null,
                    unidade_nome: lic.unidade_nome ?? null,
                    municipio_nome: lic.municipio_nome ?? null,
                    uf_sigla: lic.uf ?? null,
                    link_pncp: linkPNCP,
                    raw_data: lic,
                    is_viewed: false,
                  })
                  .select();

                if (!insertQuery) {
                  console.error('Supabase returned no response when inserting licitacao');
                  continue;
                }

                if (insertQuery.error) {
                  console.error('Error inserting licitacao:', insertQuery.error);
                  continue;
                }

                const insertedRows = insertQuery.data as any[] | null;
                const newLicitacao = insertedRows && insertedRows[0];

                if (!newLicitacao) {
                  console.error('No data returned after inserting licitacao');
                  continue;
                }

                console.log(`Saved licitacao: ${numeroControle}`);
                totalLicitacoesFound++;
                fetchedSoFar++;
                configResultsCount++;

                await classifyLicitacaoComIA(supabase, newLicitacao, config);
              } catch (error) {
                console.error('Unexpected error inserting licitacao:', error);
              }
            }

            if (items.length < PAGE_SIZE) {
              break;
            }

            if (totalFromApi && fetchedSoFar >= totalFromApi) {
              break;
            }

            page++;
          }
        }

        // Update last search date
        await supabase
          .from('search_configurations')
          .update({ last_search_date: new Date().toISOString() })
          .eq('id', config.id);

        // Se chegou até aqui sem erro hard, status é success
        await supabase
          .from('search_logs')
          .insert({
            user_id: null,
            search_configuration_id: config.id,
            params: logParams,
            status: 'success',
            results_count: configResultsCount,
            error_message: null,
          });
      } catch (e: any) {
        const message = e?.message || String(e);
        console.error('Error processing config in search-licitacoes:', message);
        configError = message;

        await supabase
          .from('search_logs')
          .insert({
            user_id: null,
            search_configuration_id: config.id,
            params: logParams,
            status: 'error',
            results_count: configResultsCount,
            error_message: message,
          });
      }
    }

    console.log(`Total licitacoes found: ${totalLicitacoesFound}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalConfigs: configs?.length || 0,
        totalLicitacoesFound 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // Log detalhado para identificar a origem do erro
    if (error instanceof Error) {
      console.error('Error in search-licitacoes (detailed):', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error('Error in search-licitacoes (non-Error value):', error);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
