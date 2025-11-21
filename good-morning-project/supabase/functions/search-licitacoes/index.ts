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
