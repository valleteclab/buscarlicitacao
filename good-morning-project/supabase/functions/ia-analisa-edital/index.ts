import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_ANALYSIS_MODEL = Deno.env.get('OPENROUTER_ANALYSIS_MODEL') ?? 'meta-llama/llama-3.1-8b-instruct';
const OPENROUTER_PDF_ENGINE = Deno.env.get('OPENROUTER_PDF_ENGINE') ?? 'pdf-text';
const OPENROUTER_FALLBACK_MODEL = Deno.env.get('OPENROUTER_FALLBACK_MODEL') || null;

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set. The ia-analisa-edital function will not work without it.');
}

interface LicitacaoBase {
  id: string;
  numero_compra: string | null;
  ano_compra: number | null;
  objeto_compra: string | null;
  orgao_razao_social: string | null;
  orgao_cnpj: string | null;
  municipio_nome: string | null;
  uf_sigla: string | null;
  valor_total_estimado: number | null;
  data_publicacao_pncp: string | null;
  data_encerramento_proposta: string | null;
  modalidade_nome: string | null;
  search_config_id: string | null;
}

interface DocumentoPncp {
  id: string;
  tipo_documento_nome: string | null;
  url_pncp: string | null;
}

interface SearchConfiguration {
  id: string;
  name: string | null;
  keywords: string[] | null;
  states: string[] | null;
}

interface EditalAnalysisResult {
  resumo_geral: string;
  requisitos_obrigatorios?: string[];
  documentos_exigidos?: string[];
  riscos?: string[];
  recomendacao_participar: boolean;
  justificativa_recomendacao: string;
  score_adequacao: number;
  perguntas_para_cliente?: string[];
}

const buildPrompt = (
  licitacao: LicitacaoBase,
  configuracao: SearchConfiguration | null,
) => {
  const detalhes = {
    numero_compra: licitacao.numero_compra,
    ano_compra: licitacao.ano_compra,
    modalidade: licitacao.modalidade_nome,
    objeto: licitacao.objeto_compra,
    orgao: licitacao.orgao_razao_social,
    local: licitacao.municipio_nome && licitacao.uf_sigla
      ? `${licitacao.municipio_nome}/${licitacao.uf_sigla}`
      : licitacao.uf_sigla,
    valor_total_estimado: licitacao.valor_total_estimado,
    data_publicacao: licitacao.data_publicacao_pncp,
    data_encerramento: licitacao.data_encerramento_proposta,
  };

  const configResumo = configuracao
    ? `\nConfiguração ativa: ${configuracao.name || 'Sem nome'}\n` +
      `Palavras-chave: ${(configuracao.keywords || []).join(', ') || 'Não informadas'}\n` +
      `Estados foco: ${(configuracao.states || []).join(', ') || 'Não definidos'}`
    : 'Sem configuração associada.';

  return `Você é um consultor jurídico especializado em licitações brasileiras.\n` +
    `Analise o edital em PDF anexado e produza um diagnóstico completo da oportunidade, sempre respondendo APENAS em JSON válido, sem comentários (não use // nem /* */) e sem nenhum texto antes ou depois do JSON.\n\n` +
    `Dados da licitação (oferecidos fora do PDF):\n${JSON.stringify(detalhes, null, 2)}\n\n` +
    `${configResumo}\n\n` +
    `Sua resposta DEVE ser exclusivamente um JSON com o seguinte formato:\n{
      "resumo_geral": string,
      "requisitos_obrigatorios": string[],
      "documentos_exigidos": string[],
      "riscos": string[],
      "recomendacao_participar": boolean,
      "justificativa_recomendacao": string,
      "score_adequacao": number (0 a 100),
      "perguntas_para_cliente": string[] opcional
    }\n\n` +
    `Instruções importantes:\n` +
    `- Considere que o cliente atua no segmento descrito em "Configuração ativa" (palavras-chave e estados foco). A recomendação deve refletir a aderência a esse perfil, mas SEM inventar requisitos ou documentos que não estejam no edital.\n` +
    `- Preencha SEMPRE os campos "requisitos_obrigatorios", "documentos_exigidos" e "riscos" como listas de itens curtos e objetivos (sem parágrafos longos).\n` +
    `- Em "requisitos_obrigatorios", vá primeiro às seções típicas de habilitação (por exemplo, "Da Habilitação", "Documentos de Habilitação", "Da Participação", "Condições para Participação") e liste APENAS requisitos que apareçam de forma clara ali: exigência de experiência prévia, atestados específicos, capital social mínimo, índices econômico-financeiros, certificações, credenciamentos, condições de habilitação restritivas, impedimentos, etc. NÃO presuma requisitos com base em práticas típicas; se não encontrar nada, deixe a lista vazia e explique isso na justificativa.\n` +
    `- Em "documentos_exigidos", destaque principalmente os documentos de habilitação jurídica, fiscal, trabalhista, qualificação técnica e econômico-financeira (ex.: contrato social, CNPJ, certidões fiscais, CNDT, CND/INSS, FGTS, balanço patrimonial, atestados de capacidade técnica, declarações, procurações). Liste APENAS documentos explicitamente mencionados no edital, mencionando cláusulas ou anexos quando possível. NÃO inclua CNDT, INSS, FGTS, INMETRO, ISO ou documentos semelhantes se o edital não falar disso de forma clara.\n` +
    `- Em "riscos", liste de 3 a 10 riscos ou pontos de atenção práticos (prazos curtos, escopo muito amplo, exigências incomuns, risco de disputa de preço, riscos contratuais, etc.), podendo incluir inferências, mas deixando claro quando algo não está explicitamente escrito.\n` +
    `- Se possível, preencha "perguntas_para_cliente" com 3 a 10 dúvidas que a equipe deve tirar internamente, principalmente sobre pontos não detalhados no edital.\n` +
    `- A recomendação de participação e o score de adequação devem considerar principalmente: alinhamento de escopo, localização (UF/município) e palavras-chave da configuração ativa.\n` +
    `- Se o PDF ou o aviso não trouxer uma informação, deixe o campo como lista vazia ou explique isso na justificativa (não invente dados).\n` +
    `- Seja específico nos requisitos/documentos (cite itens, anexos, prazos, valores quando estiverem disponíveis).\n` +
    `- O campo "resumo_geral" deve ter no máximo 900 caracteres (cerca de 10 a 12 linhas).\n` +
    `- Cada item das listas (requisitos, documentos, riscos, perguntas) deve ter no máximo 250 caracteres.\n` +
    `- Se o edital parecer inadequado, justifique claramente na recomendação.\n` +
    `- Score 0 = totalmente inadequado; 100 = altamente alinhado.\n` +
    `- NÃO envolva conteúdo fora do PDF/aviso + dados fornecidos.`;
};

const extractJson = (text: string): EditalAnalysisResult => {
  const codeBlockMatch = text.match(/```json([\s\S]*?)```/i);
  const raw = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1) {
    const preview = raw.slice(0, 300).replace(/\s+/g, ' ');
    throw new Error(`Resposta do modelo não contém JSON válido. Prévia da resposta: "${preview}"`);
  }

  const jsonString = raw.slice(firstBrace, lastBrace + 1);

  // Remove comentários de estilo JavaScript antes de fazer o parse,
  // pois alguns modelos costumam inserir linhas com // dentro do JSON.
  // Importante: só removemos linhas que começam com // (ignorando espaços iniciais)
  // para não quebrar valores de string com "https://".
  const withoutLineComments = jsonString.replace(/^\s*\/\/.*$/gm, '');
  const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');

  try {
    return JSON.parse(withoutBlockComments) as EditalAnalysisResult;
  } catch (parseError) {
    const preview = withoutBlockComments.slice(0, 300).replace(/\s+/g, ' ');
    throw new Error(`Falha ao fazer parse do JSON da IA: ${(parseError as Error).message}. Trecho: "${preview}"`);
  }
};

const chooseDocumentoPdf = (documentos: DocumentoPncp[]): DocumentoPncp | null => {
  if (!documentos || documentos.length === 0) return null;

  // 1) Tenta primeiro URLs que claramente são PDF
  const pdfDocs = documentos.filter((doc) => {
    const url = doc.url_pncp?.toLowerCase() || '';
    return url.endsWith('.pdf') || url.includes('.pdf?');
  });

  const pickByPriority = (docs: DocumentoPncp[]) => {
    if (!docs.length) return null;
    return (
      docs.find((doc) => /edital/i.test(doc.tipo_documento_nome || '')) ||
      docs.find((doc) => /termo|refer[êe]ncia/i.test(doc.tipo_documento_nome || '')) ||
      docs[0]
    );
  };

  let chosen = pickByPriority(pdfDocs);

  // 2) Se não achar PDF explícito, tenta qualquer documento com URL
  if (!chosen) {
    const docsWithUrl = documentos.filter((doc) => !!doc.url_pncp);
    chosen = pickByPriority(docsWithUrl);
  }

  return chosen || null;
};

const findPncpArquivoUrlFallback = async (licitacao: LicitacaoBase): Promise<string | null> => {
  if (!licitacao.orgao_cnpj || !licitacao.ano_compra || !licitacao.numero_compra) return null;

  const base = `https://pncp.gov.br/pncp-api/v1/orgaos/${licitacao.orgao_cnpj}/compras/${licitacao.ano_compra}/${licitacao.numero_compra}/arquivos`;

  // Tenta alguns índices de arquivo (1 a 5) até encontrar um que responda 2xx
  for (let i = 1; i <= 5; i++) {
    const url = `${base}/${i}`;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        return url;
      }
    } catch (e) {
      console.error('Erro ao testar URL de arquivo PNCP', url, e);
    }
  }

  return null;
};

const assertPdfUrlOrThrow = async (url: string) => {
  try {
    // Tenta primeiro HEAD para inspecionar apenas headers
    let resp = await fetch(url, { method: 'HEAD' });

    // Alguns servidores não aceitam HEAD; cai para GET se vier status 405/501 ou não-ok
    if (!resp.ok || resp.status === 405 || resp.status === 501) {
      resp = await fetch(url, { method: 'GET' });
    }

    const contentType = resp.headers.get('content-type')?.toLowerCase() ?? '';
    const contentDisp = resp.headers.get('content-disposition')?.toLowerCase() ?? '';
    const lowerUrl = url.toLowerCase();

    const looksPdf =
      contentType.includes('pdf') ||
      contentDisp.includes('.pdf') ||
      lowerUrl.includes('.pdf');

    if (!looksPdf) {
      throw new Error(
        `O arquivo selecionado para o edital não parece ser um PDF (content-type="${contentType || 'desconhecido'}", content-disposition="${contentDisp || 'desconhecido'}"). A análise automática não foi executada.`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Não foi possível verificar o tipo de arquivo do edital para análise.');
  }
};

const fetchPdfAsDataUrl = async (url: string): Promise<string> => {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Falha ao baixar o PDF do edital para análise (status ${resp.status}).`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = btoa(binary);
  return `data:application/pdf;base64,${base64}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY não configurada');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const licitacaoId = body?.licitacao_id as string | undefined;
    const uploadUrl = body?.upload_url as string | undefined;

    if (!licitacaoId) {
      throw new Error('Informe o campo licitacao_id no corpo da requisição.');
    }

    const { data: licitacao, error: licitacaoError } = await supabase
      .from('licitacoes_encontradas')
      .select(`
        id,
        numero_compra,
        ano_compra,
        objeto_compra,
        orgao_razao_social,
        orgao_cnpj,
        municipio_nome,
        uf_sigla,
        valor_total_estimado,
        data_publicacao_pncp,
        data_encerramento_proposta,
        modalidade_nome,
        search_config_id
      `)
      .eq('id', licitacaoId)
      .single();

    if (licitacaoError) {
      throw licitacaoError;
    }
    if (!licitacao) {
      throw new Error('Licitação não encontrada.');
    }

    let editalUrl: string | null = uploadUrl || null;

    if (!editalUrl) {
      const { data: documentos } = await supabase
        .from('licitacao_documentos_pncp')
        .select('id, tipo_documento_nome, url_pncp')
        .eq('licitacao_encontrada_id', licitacaoId);

      const docs = documentos || [];

      if (docs.length === 0) {
        // Nenhum documento armazenado no banco: tenta buscar diretamente no PNCP
        const fallbackUrl = await findPncpArquivoUrlFallback(licitacao as LicitacaoBase);
        if (!fallbackUrl) {
          throw new Error('Nenhum PDF de edital encontrado para esta licitação (sem documentos no banco e nenhuma URL válida encontrada no PNCP).');
        }
        editalUrl = fallbackUrl;
      } else {
        const documentoSelecionado = chooseDocumentoPdf(docs);
        if (!documentoSelecionado || !documentoSelecionado.url_pncp) {
          const sample = docs.slice(0, 5).map((d) => ({
            id: d.id,
            tipo_documento_nome: d.tipo_documento_nome,
            url_pncp: d.url_pncp,
          }));
          throw new Error(
            `Nenhum PDF de edital encontrado para esta licitação. Documentos recebidos: ${docs.length}. Amostra: ${JSON.stringify(sample)}`,
          );
        }

        editalUrl = documentoSelecionado.url_pncp;
      }
    }

    if (!editalUrl) {
      throw new Error('Nenhum URL de edital disponível para análise.');
    }

    // Garante que o recurso pareça realmente um PDF antes de enviar para o OpenRouter,
    // evitando analisar arquivos ZIP ou outros formatos binários.
    await assertPdfUrlOrThrow(editalUrl);
    const editalDataUrl = await fetchPdfAsDataUrl(editalUrl);

    let configuracao: SearchConfiguration | null = null;
    if (licitacao.search_config_id) {
      const { data: config } = await supabase
        .from('search_configurations')
        .select('id, name, keywords, states')
        .eq('id', licitacao.search_config_id)
        .single();
      configuracao = config || null;
    }

    await supabase
      .from('licitacao_edital_ia')
      .upsert({
        licitacao_encontrada_id: licitacaoId,
        edital_url: editalUrl,
        ia_status: 'processing',
        ia_processing_error: null,
        ia_updated_at: new Date().toISOString(),
      }, { onConflict: 'licitacao_encontrada_id' });

    const prompt = buildPrompt(licitacao as LicitacaoBase, configuracao);

    const primaryModel = OPENROUTER_ANALYSIS_MODEL;
    const fallbackModel = OPENROUTER_FALLBACK_MODEL;

    const callOpenRouter = async (model: string) => {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://localhost',
          'X-Title': 'BuscaLicitacao IA Edital',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
                {
                  type: 'file',
                  file: {
                    filename: 'edital.pdf',
                    file_data: editalDataUrl,
                  },
                },
              ],
            },
          ],
          plugins: [
            {
              id: 'file-parser',
              pdf: {
                engine: OPENROUTER_PDF_ENGINE,
              },
            },
          ],
          temperature: 0.1,
          max_tokens: 1800,
        }),
      });

      const errorText = !response.ok ? await response.text() : '';
      if (!response.ok) {
        throw new Error(`Erro na API OpenRouter (model=${model}): ${response.status} - ${errorText}`);
      }

      return response.json();
    };

    let usedModel = primaryModel;
    let completion: any;

    try {
      completion = await callOpenRouter(primaryModel);
    } catch (primaryError) {
      const msg = primaryError instanceof Error ? primaryError.message : String(primaryError);
      const isProviderError =
        msg.includes('Provider returned error') ||
        msg.includes('unknown error in the model inference server');

      const canFallback = !!fallbackModel && primaryModel !== fallbackModel;

      if (isProviderError && canFallback) {
        console.warn('Erro no modelo primário, tentando fallback para', fallbackModel, 'Detalhes:', msg);
        try {
          usedModel = fallbackModel as string;
          completion = await callOpenRouter(fallbackModel as string);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(
            `Falha ao chamar modelo primário (${primaryModel}) e fallback (${fallbackModel}). ` +
            `Erro primário: ${msg}. Erro fallback: ${fallbackMsg}`,
          );
        }
      } else {
        throw primaryError;
      }
    }

    const choice = completion?.choices?.[0];
    const messageContent = choice?.message?.content;

    let textResponse = '';

    if (typeof messageContent === 'string') {
      textResponse = messageContent;
    } else if (Array.isArray(messageContent)) {
      textResponse = messageContent
        .map((chunk: any) => {
          if (!chunk) return '';
          if (typeof chunk === 'string') return chunk;
          return chunk.text ?? chunk.content ?? '';
        })
        .filter(Boolean)
        .join('\n');
    } else if (messageContent && typeof messageContent === 'object') {
      textResponse = (messageContent as any).text ?? (messageContent as any).content ?? '';
    }

    if (!textResponse) {
      try {
        console.error(
          'ia-analisa-edital: messageContent sem texto utilizável:',
          JSON.stringify(messageContent ?? null).slice(0, 1000),
        );
      } catch {
        console.error('ia-analisa-edital: messageContent sem texto utilizável e não serializável');
      }
      throw new Error('Resposta vazia ou inválida da IA de análise do edital.');
    }

    const parsed = extractJson(textResponse);

    await supabase
      .from('licitacao_edital_ia')
      .upsert({
        licitacao_encontrada_id: licitacaoId,
        edital_url: editalUrl,
        ia_status: 'done',
        ia_resumo: parsed.resumo_geral,
        ia_requisitos_obrigatorios: parsed.requisitos_obrigatorios ?? [],
        ia_documentos_exigidos: parsed.documentos_exigidos ?? [],
        ia_riscos: parsed.riscos ?? [],
        ia_recomendacao_participar: parsed.recomendacao_participar,
        ia_justificativa: parsed.justificativa_recomendacao,
        ia_score_adequacao: parsed.score_adequacao,
        ia_raw_json: parsed,
        ia_model: usedModel,
        ia_processing_error: null,
        ia_updated_at: new Date().toISOString(),
      }, { onConflict: 'licitacao_encontrada_id' });

    return new Response(JSON.stringify({
      status: 'ok',
      licitacao_id: licitacaoId,
      analysis: parsed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na função ia-analisa-edital:', error);

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const body = await req.json().catch(() => null);
        const licitacaoIdFromBody = (body as any)?.licitacao_id as string | undefined;
        if (licitacaoIdFromBody) {
          await supabase
            .from('licitacao_edital_ia')
            .upsert({
              licitacao_encontrada_id: licitacaoIdFromBody,
              ia_status: 'error',
              ia_processing_error: (error as Error).message,
              ia_updated_at: new Date().toISOString(),
            }, { onConflict: 'licitacao_encontrada_id' });
        }
      }
    } catch (innerError) {
      console.error('Erro ao salvar status de erro da análise de edital:', innerError);
    }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
