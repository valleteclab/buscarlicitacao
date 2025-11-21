import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_CHAT_MODEL =
  Deno.env.get('OPENROUTER_CHAT_MODEL') ||
  Deno.env.get('OPENROUTER_ANALYSIS_MODEL') ||
  'meta-llama/llama-3.1-8b-instruct';
const OPENROUTER_PDF_ENGINE = Deno.env.get('OPENROUTER_PDF_ENGINE') ?? 'pdf-text';
const OPENROUTER_FALLBACK_MODEL = Deno.env.get('OPENROUTER_FALLBACK_MODEL') || null;

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set. The ia-edital-chat function will not work without it.');
}

// Tipagens simples para mensagens de chat enviadas pelo frontend
interface ChatMessageInput {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Apenas para manter simetria de ambiente / permissões se quisermos evoluir depois
const getSupabaseServerClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

const assertPdfUrlOrThrow = async (url: string) => {
  try {
    let resp = await fetch(url, { method: 'HEAD' });

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
        `O recurso informado não parece ser um PDF (content-type="${contentType || 'desconhecido'}", content-disposition="${contentDisp || 'desconhecido'}").`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Não foi possível verificar o tipo de arquivo informado para o chat.');
  }
};

const fetchPdfAsDataUrl = async (url: string): Promise<string> => {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Falha ao baixar o PDF para o chat (status ${resp.status}).`);
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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY não configurada');
    }

    // Garante que as variáveis básicas do Supabase existam (mesmo que o chat em si não use o banco agora)
    getSupabaseServerClient();

    const body = await req.json();
    const pdfUrl = (body?.pdf_url || body?.pdfUrl) as string | undefined;
    const messagesInput = body?.messages as ChatMessageInput[] | undefined;

    if (!Array.isArray(messagesInput) || messagesInput.length === 0) {
      throw new Error('Informe um array messages com pelo menos uma mensagem de usuário.');
    }

    let pdfDataUrl: string | null = null;
    if (pdfUrl) {
      await assertPdfUrlOrThrow(pdfUrl);
      pdfDataUrl = await fetchPdfAsDataUrl(pdfUrl);
    }

    // Converte mensagens simples em formato esperado pela OpenRouter
    const mappedMessages = messagesInput.map((m) => ({
      role: m.role,
      content: [
        {
          type: 'text' as const,
          text: m.content,
        },
      ],
    }));

    // Se houver PDF, garante que exista ao menos uma mensagem de usuário para anexar o arquivo
    if (pdfDataUrl) {
      let lastUserIndex = -1;
      for (let i = mappedMessages.length - 1; i >= 0; i--) {
        if (mappedMessages[i].role === 'user') {
          lastUserIndex = i;
          break;
        }
      }

      if (lastUserIndex === -1) {
        mappedMessages.push({
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: 'Analise o edital em PDF anexado.',
            },
          ],
        });
        lastUserIndex = mappedMessages.length - 1;
      }

      // Anexa o PDF como arquivo na última mensagem de usuário, usando base64 em file_data
      mappedMessages[lastUserIndex].content.push({
        type: 'file',
        file: {
          filename: 'edital.pdf',
          file_data: pdfDataUrl,
        },
      } as any);
    }

    const primaryModel = OPENROUTER_CHAT_MODEL;
    const fallbackModel = OPENROUTER_FALLBACK_MODEL;

    const callOpenRouter = async (model: string) => {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://localhost',
          'X-Title': 'BuscaLicitacao IA Edital Chat',
        },
        body: JSON.stringify({
          model,
          messages: mappedMessages,
          ...(pdfDataUrl
            ? {
                plugins: [
                  {
                    id: 'file-parser',
                    pdf: {
                      engine: OPENROUTER_PDF_ENGINE,
                    },
                  },
                ],
              }
            : {}),
          temperature: 0.2,
          max_tokens: 1500,
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
        console.warn('Erro no modelo primário do chat, tentando fallback para', fallbackModel, 'Detalhes:', msg);
        try {
          usedModel = fallbackModel as string;
          completion = await callOpenRouter(fallbackModel as string);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new Error(
            `Falha ao chamar modelo primário (${primaryModel}) e fallback (${fallbackModel}) no chat. ` +
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
          'ia-edital-chat: messageContent sem texto utilizável:',
          JSON.stringify(messageContent ?? null).slice(0, 1000),
        );
      } catch {
        console.error('ia-edital-chat: messageContent sem texto utilizável e não serializável');
      }
      throw new Error('Resposta vazia ou inválida da IA no chat do edital.');
    }

    return new Response(JSON.stringify({
      status: 'ok',
      model: usedModel,
      reply: textResponse,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na função ia-edital-chat:', error);

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
