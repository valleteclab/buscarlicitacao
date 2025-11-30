import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'x-ai/grok-4.1-fast:free';
const IA_BATCH_SIZE = Number(Deno.env.get('IA_BATCH_SIZE') ?? '50');

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set. The ia-filtrar function will not work without it.');
}

interface LicitacaoIA {
  id: string;
  numero_controle_pncp: string | null;
  numero_compra: string | null;
  ano_compra: number | null;
  objeto_compra: string | null;
  modalidade_nome: string | null;
  valor_total_estimado: number | null;
  data_publicacao_pncp: string | null;
  data_encerramento_proposta: string | null;
  municipio_nome: string | null;
  uf_sigla: string | null;
  orgao_razao_social: string | null;
  raw_data: Record<string, unknown> | null;
  search_config_id: string | null;
  vai_participar: boolean | null;
  status_interno: string | null;
  ia_score: number | null;
  ia_needs_review: boolean | null;
  search_configurations?: {
    name: string;
    keywords: string[] | null;
    states: string[] | null;
  } | null;
}

interface IAClassificationResult {
  score: number;
  justificativa: string;
  relevante: boolean;
  tags?: string[];
}

const buildPrompt = (licitacao: LicitacaoIA) => {
  const resumo = {
    numero_controle_pncp: licitacao.numero_controle_pncp,
    numero_compra: licitacao.numero_compra,
    ano_compra: licitacao.ano_compra,
    modalidade: licitacao.modalidade_nome,
    objeto: licitacao.objeto_compra,
    valor_total_estimado: licitacao.valor_total_estimado,
    data_publicacao: licitacao.data_publicacao_pncp,
    data_encerramento: licitacao.data_encerramento_proposta,
    local: licitacao.municipio_nome && licitacao.uf_sigla ? `${licitacao.municipio_nome}/${licitacao.uf_sigla}` : licitacao.uf_sigla,
    orgao: licitacao.orgao_razao_social,
  };

  const config = licitacao.search_configurations;
  const keywords = Array.isArray(config?.keywords) ? config?.keywords.join(', ') : 'não informadas';
  const states = Array.isArray(config?.states) ? config?.states.join(', ') : 'não definidos';

  return `Você é um analista especialista em licitações e deve indicar se a oportunidade a seguir é relevante
para o usuário com base nas palavras-chave e estados configurados.

REGRAS GERAIS (SCORE):
- Atribua um score de 0 a 100 (quanto mais alto, mais relevante).
- Considere principalmente a aderência do OBJETO às palavras-chave da busca.
- Use a seguinte régua:
  - 90 a 100: objeto claramente alinhado com várias palavras-chave principais da busca.
  - 75 a 89: objeto bem alinhado, mas não perfeito (ou parcialmente relacionado a algumas keywords).
  - 50 a 74: relação moderada / indireta com as keywords.
  - 31 a 49: relação fraca.
  - 0 a 30: não aderente às keywords.
- Responda APENAS com JSON válido (sem texto extra).
- Campos obrigatórios do JSON de resposta: {
    "score": number,
    "justificativa": string,
    "relevante": boolean,
    "tags": string[] opcional
  }

REGRAS SOBRE PALAVRAS-CHAVE:
- Leia com atenção o campo de objeto/descrição da licitação.
- NUNCA afirme que uma palavra-chave está presente se ela NÃO aparecer claramente no texto da licitação
  (objeto ou descrição dos itens) ou em um sinônimo MUITO óbvio.
- Se nenhuma palavra-chave (nem sinônimos óbvios) for encontrada no texto, defina obrigatoriamente:
    "relevante": false
    "score": no máximo 30
- Quando o objeto menciona de forma clara termos diretamente relacionados às keywords (por exemplo,
  para buscas de informática/TI: "computadores", "notebooks", "desktops", "laptops", "equipamentos de TI",
  "material de informática", "hardware", etc.), e isso estiver alinhado com as palavras-chave da busca,
  dê preferência a scores na faixa de 85 a 100.
- Na justificativa, explique sempre quais palavras-chave encontrou, em qual parte do texto e por que isso
  levou ao score atribuído; se não encontrou nenhuma, diga explicitamente que nenhuma palavra-chave foi encontrada.

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

  if (typeof parsed.score !== 'number' || typeof parsed.justificativa !== 'string' || typeof parsed.relevante !== 'boolean') {
    throw new Error('JSON retornado não contém os campos esperados.');
  }

  return parsed as IAClassificationResult;
};

const callOpenRouter = async (prompt: string) => {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY não configurada');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      // Opcional, mas recomendado pela OpenRouter para identificação do app
      'HTTP-Referer': 'https://localhost',
      'X-Title': 'BuscaLicitacao IA Filter',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Você é um analista especialista em licitações brasileiras. Sempre responda APENAS em JSON válido, sem texto extra. Nunca invente informações: não diga que uma palavra-chave está presente se ela não aparece claramente no texto fornecido. Baseie-se apenas nas informações da licitação e nas regras descritas pelo usuário.',
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
    const fallback: IAClassificationResult = {
      score: 0,
      justificativa: 'Resposta vazia ou inválida da IA; classificado automaticamente como não relevante.',
      relevante: false,
      tags: ['fallback', 'invalid_response'],
    };
    return fallback;
  }

  return extractJson(text);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let searchConfigId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.search_config_id === 'string') {
        searchConfigId = body.search_config_id;
      }
    } catch {
      // corpo vazio ou inválido => ignora e segue sem filtro adicional
    }

    let query = supabase
      .from('licitacoes_encontradas')
      .select(`
        id,
        numero_controle_pncp,
        numero_compra,
        ano_compra,
        objeto_compra,
        modalidade_nome,
        valor_total_estimado,
        data_publicacao_pncp,
        data_encerramento_proposta,
        municipio_nome,
        uf_sigla,
        orgao_razao_social,
        raw_data,
        search_config_id,
        vai_participar,
        status_interno,
        ia_score,
        ia_needs_review,
        search_configurations ( name, keywords, states )
      `)
      // Apenas licitações ainda não classificadas pela IA
      .is('ia_score', null)
      // Exclui as que o usuário já marcou que vai participar
      .neq('vai_participar', true)
      // Exclui as que estão na lixeira
      .neq('status_interno', 'lixeira');

    if (searchConfigId) {
      query = query.eq('search_config_id', searchConfigId);
    }

    const { data: pendentes, error: fetchError } = await query.limit(IA_BATCH_SIZE);

    if (fetchError) {
      throw fetchError;
    }

    if (!pendentes || pendentes.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'Nenhuma licitação pendente para revisão IA.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const results = [] as Array<{ id: string; status: 'ok' | 'error'; error?: string }>;

    for (const licitacao of pendentes as LicitacaoIA[]) {
      try {
        const prompt = buildPrompt(licitacao);
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

        results.push({ id: licitacao.id, status: 'ok' });
      } catch (error: any) {
        console.error('Erro ao classificar licitação', licitacao.id, error);
        await supabase
          .from('licitacoes_encontradas')
          .update({
            ia_processing_error: error?.message || 'Erro desconhecido',
            ia_reviewed_at: new Date().toISOString(),
            ia_needs_review: true,
          })
          .eq('id', licitacao.id);

        results.push({ id: licitacao.id, status: 'error', error: error?.message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Erro na função ia-filtrar:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
