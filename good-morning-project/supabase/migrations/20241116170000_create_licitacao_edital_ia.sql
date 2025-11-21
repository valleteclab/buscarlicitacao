create table if not exists public.licitacao_edital_ia (
  licitacao_encontrada_id uuid primary key references public.licitacoes_encontradas(id) on delete cascade,
  edital_url text,
  edital_texto text,
  ia_status text default 'pending',
  ia_resumo text,
  ia_requisitos_obrigatorios jsonb,
  ia_documentos_exigidos jsonb,
  ia_riscos jsonb,
  ia_recomendacao_participar boolean,
  ia_justificativa text,
  ia_score_adequacao numeric,
  ia_model text,
  ia_raw_json jsonb,
  ia_processing_error text,
  created_at timestamptz default now(),
  ia_updated_at timestamptz
);

create index if not exists idx_licitacao_edital_ia_status
  on public.licitacao_edital_ia (ia_status);
