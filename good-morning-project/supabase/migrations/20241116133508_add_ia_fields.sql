alter table public.licitacoes_encontradas
  add column if not exists ia_score numeric,
  add column if not exists ia_justificativa text,
  add column if not exists ia_filtrada boolean default false,
  add column if not exists ia_reviewed_at timestamptz,
  add column if not exists ia_needs_review boolean default true,
  add column if not exists ia_processing_error text;
