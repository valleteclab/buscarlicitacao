alter table public.licitacoes_encontradas
  add column if not exists gestao_checklist jsonb,
  add column if not exists gestao_notas text;
