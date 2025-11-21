-- Tabela de logs das buscas no PNCP para fins de monitoramento/auditoria

create table if not exists public.search_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Relacionamentos
  user_id uuid references public.profiles (id),
  search_configuration_id uuid references public.search_configurations (id) on delete set null,

  -- Dados da busca (parâmetros usados na chamada ao PNCP)
  params jsonb not null,

  -- Resultado da execução
  status text not null check (status in ('success', 'error')),
  results_count integer not null default 0,
  error_message text
);

create index if not exists idx_search_logs_created_at
  on public.search_logs (created_at desc);

create index if not exists idx_search_logs_config
  on public.search_logs (search_configuration_id);
