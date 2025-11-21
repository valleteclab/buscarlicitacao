# Sistema de Busca de Licitações PNCP

Este repositório contém o código do sistema de apoio à participação em licitações públicas com base nos dados do **PNCP (Portal Nacional de Contratações Públicas)**.

O objetivo é:

- Buscar licitações automaticamente no PNCP de acordo com configurações de busca (palavras-chave, estados, modalidades etc.).
- Salvar e organizar as licitações encontradas em um banco de dados Supabase.
- Ajudar na **gestão da participação** (pipeline de status, checklist interno, notas, agenda de prazos).
- Usar **IA** para análise de editais e filtragem de licitações.
- Disponibilizar uma página de **monitoramento** para auditoria das buscas realizadas.

## Estrutura principal

- `good-morning-project/`
  - Aplicação web (React + Vite + TypeScript).
  - Integração com Supabase (auth, banco, storage e Edge Functions).
- `supabase/`
  - Configurações do projeto Supabase (migrations, functions, config.toml).
- `Docs/`
  - Documentos de referência (editais, manuais, PRD, etc.).

> Observação: neste repositório, `good-morning-project` está versionado como um submódulo Git. O código completo da aplicação web fica dentro dessa pasta.

## Tecnologias

- **Frontend**: React, TypeScript, Vite, shadcn/ui.
- **Estado / dados**: @tanstack/react-query, Supabase JS client.
- **Backend**: Supabase (Postgres + Edge Functions em Deno).
- **Banco de dados**: PostgreSQL gerenciado pelo Supabase.

## Como rodar o frontend localmente

1. Acesse a pasta do projeto web:

   ```bash
   cd good-morning-project
   ```

2. Instale as dependências:

   ```bash
   npm install
   # ou
   pnpm install
   ```

3. Configure as variáveis de ambiente (arquivo `.env` ou `.env.local`), por exemplo:

   ```bash
   VITE_SUPABASE_URL=...        # URL do seu projeto Supabase
   VITE_SUPABASE_PUBLISHABLE_KEY=...  # chave pública (anon) do Supabase
   ```

4. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

O app normalmente roda em `http://localhost:5173`.

## Funções e monitoramento

Algumas funções importantes implementadas como **Supabase Edge Functions**:

- `search-licitacoes` – busca licitações no PNCP com base nas configurações ativas e insere novas licitações na tabela `licitacoes_encontradas`.
- Funções de IA para análise de edital e chat sobre o edital.

Para auditoria, há uma tabela `search_logs` que registra cada execução da função de busca, incluindo:

- Parâmetros usados.
- Status da execução (success / error).
- Quantidade de **novas licitações** inseridas (`results_count`).

A aplicação possui uma página de **Monitoramento** que consome esses logs e exibe as execuções de busca para uso administrativo.

## Como contribuir / próximos passos

- Ajustar e documentar melhor o fluxo de deploy das Edge Functions (via Supabase CLI ou painel).
- Melhorar filtros e relatórios na página de monitoramento.
- Evoluir o README com prints de tela e exemplos de uso.

---

Este README é um ponto de partida. Sinta-se à vontade para adaptar o texto, adicionar imagens e detalhar o processo de configuração conforme o projeto evoluir.
