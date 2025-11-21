const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const body = await req.json();
    const { orgao_cnpj, ano_compra, numero_compra, numero_controle_pncp } = body as {
      orgao_cnpj?: string;
      ano_compra?: number;
      numero_compra?: string;
      numero_controle_pncp?: string;
    };

    if (!orgao_cnpj || !ano_compra || !numero_compra) {
      return new Response(JSON.stringify({ error: 'Missing orgao_cnpj, ano_compra or numero_compra' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let portal: any = null;

    try {
      // O Swagger expõe o endpoint oficial de consulta de contratação:
      // GET /api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}
      // Usamos orgao_cnpj, ano_compra e numero_compra (convertido para sequencial numérico).
      const sequencialNum = Number(String(numero_compra).replace(/\D/g, ''));

      if (!Number.isNaN(sequencialNum)) {
        const candidates = [
          sequencialNum.toString().padStart(6, '0'), // ex: 70 -> 000070
          sequencialNum.toString(),                  // ex: 70
        ];

        for (const seq of candidates) {
          const detalhesUrl = `https://pncp.gov.br/api/consulta/v1/orgaos/${orgao_cnpj}/compras/${ano_compra}/${seq}`;

          console.log('Fetching detalhes contratação from PNCP:', detalhesUrl);

          const detalhesRes = await fetch(detalhesUrl, {
            headers: { Accept: 'application/json' },
          });

          if (detalhesRes.ok) {
            portal = await detalhesRes.json();
            break;
          } else {
            console.error('Erro ao buscar detalhes contratação PNCP:', detalhesRes.status);
          }
        }
      }
    } catch (e) {
      console.error('Erro processando detalhes publicacao PNCP:', e);
    }

    const baseUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${orgao_cnpj}/compras/${ano_compra}/${numero_compra}`;

    const [itensRes, arquivosRes, historicoRes] = await Promise.all([
      fetch(`${baseUrl}/itens?pagina=1&tamanhoPagina=100`),
      fetch(`${baseUrl}/arquivos?pagina=1&tamanhoPagina=100`),
      fetch(`${baseUrl}/historico?pagina=1&tamanhoPagina=100`),
    ]);

    const itens = itensRes.ok ? await itensRes.json() : null;
    const arquivos = arquivosRes.ok ? await arquivosRes.json() : null;
    const historico = historicoRes.ok ? await historicoRes.json() : null;

    return new Response(
      JSON.stringify({ portal, itens, arquivos, historico }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Error in pncp-detalhes:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
