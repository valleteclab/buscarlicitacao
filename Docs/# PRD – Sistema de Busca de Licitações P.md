# PRD – Sistema de Busca de Licitações PNCP (Buscalicitação)

## 1. Visão e Contexto

Criar uma plataforma SaaS focada em **monitorar automaticamente licitações no Portal Nacional de Contratações Públicas (PNCP)**, permitindo que empresas e consultorias configurem filtros (palavras-chave, localização, órgãos, modalidades, etc.) e recebam, de forma contínua, **alertas de novas oportunidades**.

Além da captura, o sistema oferecerá um **módulo de gestão das licitações selecionadas**, suportando o acompanhamento do funil (interesse → análise → preparação → envio → resultado), centralização de informações e colaboração do time.

## 2. Problema

- Empresas e consultores:
  - Gastam muito tempo acessando o PNCP manualmente para procurar licitações.
  - Perdem oportunidades por não terem alertas configurados ou rotina de monitoramento estruturada.
  - Dificuldade em **organizar e dar prioridade** às licitações que surgem.
- O PNCP oferece API de consultas, mas:
  - A curva de uso é técnica.
  - Não há uma camada de produto voltada à **rotina de negócio** do fornecedor (filtros por cliente, pipeline, alertas inteligentes).

## 3. Público-alvo e Personas

- **PMEs fornecedoras do governo**
  - Ex: empresas de serviços, TI, obras, saúde.
  - Perfil: 1–3 pessoas lidando com licitações, processo pouco estruturado.

- **Consultorias/assessorias em licitações**
  - Gerenciam dezenas de CNPJs.
  - Necessitam de filtros por cliente, dashboards consolidados e evidências para prestação de contas.

- **Gestores comerciais de médias/grandes empresas**
  - Querem visão de pipeline de licitações, valor potencial, taxa de sucesso e ROI.

### Personas (exemplos)

- **Marina – Analista de Licitações**
  - Precisa de alertas por palavra-chave, localidade e modalidade.
  - Quer evitar retrabalho e não perder prazos.

- **Carlos – Consultor PJ**
  - Monitora 15 clientes.
  - Precisa aplicar filtros diferentes por cliente e enviar relatórios periódicos.

- **Fernanda – Gestora Comercial**
  - Quer priorizar oportunidades de maior valor e acompanhar resultados.

## 4. Proposta de Valor

- **Monitoramento automatizado de licitações PNCP** com filtros configuráveis.
- **Centralização das oportunidades**, com status, responsáveis e prazos.
- **Alertas proativos** (e-mail e, futuramente, WhatsApp/Telegram).
- Camada de **gestão e priorização**, não apenas busca bruta.

## 5. Objetivos do Produto e KPIs

### Objetivos

- Reduzir em pelo menos **50%** o tempo gasto em buscas manuais no PNCP.
- Aumentar em **30%** o número de licitações relevantes identificadas por cliente.
- Melhorar a **taxa de participação em licitações aderentes** (usuário participa menos de coisas “ruins”).

### KPIs

- **Tempo médio até descoberta** de nova licitação relevante (minutos após publicação).
- **Número de licitações relevantes encontradas / mês** por cliente.
- **Taxa de abertura de alertas** (e-mail / canal futuro).
- **% de licitações com status atualizado** no funil (indicador de uso do módulo de gestão).
- **Taxa de churn** e **NPS**.

## 6. Escopo de MVP

### Incluído no MVP

- Cadastro e login de usuários (multi-tenant básico).
- Cadastro de **filtros de monitoramento**:
  - Palavras-chave (texto).
  - Localização: estado, município (conforme campos disponíveis via PNCP).
  - Possíveis filtros adicionais simples: período de publicação, situação da licitação, modalidade, órgão (aproveitando os parâmetros que a API de consultas permitir).
- Serviço de coleta periódica no PNCP:
  - Job/worker que consome a API de consultas PNCP em intervalos definidos.
  - Paginação e filtro por datas para evitar duplicidade.
  - Armazenamento das licitações retornadas em banco local.
- Motor de **matching licitação ↔ filtro**:
  - Relacionar novas licitações aos filtros configurados.
  - Gravar esse vínculo para histórico.
- Tela de **lista de oportunidades** por usuário:
  - Lista de licitações encontradas com resumo (título, órgão, valor, datas principais, link para PNCP).
  - Filtros por status interno, período, palavra-chave.
- Módulo de **gestão da licitação**:
  - Pipeline simples: [Novo] → [Em análise] → [Preparando proposta] → [Enviada] → [Resultado] → [Arquivada].
  - Campos de apoio: responsável, valor estimado, probabilidade (manual), data-limite interna.
- Notificações básicas:
  - E-mail diário ou instantâneo (configurável) com novas licitações relevantes.
- Painel simples de estatísticas:
  - Número de licitações novas no período.
  - Número por status do funil.
  - Número por filtro de monitoramento.

### Fora do MVP (fase futura)

- Integrações com CRM/ERP.
- Alertas via WhatsApp/Telegram (webhooks de terceiros).
- Inteligência avançada de relevância (NLP, embeddings).
- Multiempresa avançado para consultorias (com permissões avançadas).
- Exportação avançada (relatórios customizáveis).

## 7. Fluxos Principais do Usuário

1. **Onboarding e criação da conta**
   - Usuário cria conta.
   - Informa tipo de atuação (empresa única / consultoria).
   - Configura dados básicos (nome da organização, e-mail principal para alertas).

2. **Cadastro de filtros de monitoramento**
   - Usuário define:
     - Nome do filtro (ex: “Obras – SP capital”).
     - Palavras-chave.
     - Estados e municípios.
     - Outros filtros suportados pela API (modalidade, órgão, etc., quando disponíveis).
   - Escolhe frequência de varredura e de envio de alertas (ex: imediato, diário, semanal).

3. **Coleta automática PNCP**
   - Worker executa periodicamente:
     - Consulta API PNCP utilizando parâmetros suportados.
     - Respeita paginação e limites de requisições.
     - Salva licitações novas/atualizadas no banco.
   - Replica apenas **metadados necessários** + link para detalhes no portal PNCP.

4. **Matching e notificação**
   - Para cada licitação nova:
     - Verifica quais filtros do usuário se encaixam (palavras-chave + localização + demais parâmetros).
     - Registra a associação e cria uma oportunidade na caixa de entrada do usuário.
   - Envia alertas conforme preferências (e-mail, etc.).

5. **Gestão de licitação selecionada**
   - Usuário abre a licitação:
     - Vê dados principais recebidos da API (título, órgão, datas, valor, etc.).
     - Acessa link direto ao PNCP para detalhes e documentos.
   - Define status no funil (ex: “Em análise”).
   - Atribui responsável, anotações, tags internas.
   - Atualiza status ao longo do processo.

6. **Acompanhamento e análise**
   - Usuário acompanha:
     - Quantas licitações estão em cada etapa.
     - Valor potencial (somando valores estimados).
   - Usa filtros para priorizar o que precisa ser tratado hoje (por prazo, por valor, por status).

## 8. Requisitos Funcionais

### 8.1. Gestão de Usuários e Acesso

- **Cadastro de usuário** com e-mail e senha.
- Recuperação de senha por e-mail.
- Mínimo: um plano único inicial; campo de organização (nome da empresa).
- Suporte a múltiplos usuários por organização (Admin e Usuário normal).

### 8.2. Módulo de Filtros de Monitoramento

- CRUD de filtros:
  - Nome do filtro.
  - Palavras-chave (texto livre).
  - UF (estado) e município (quando aplicável pelos parâmetros de API).
  - Outros campos se forem claramente suportados (ex.: modalidade, órgão).
- Indicação de **frequência de varredura** (config padrão do sistema; eventualmente, por filtro).
- Campo para ativar/desativar filtro sem excluir.

### 8.3. Coleta e Sincronização com PNCP

- Serviço/worker que roda periodicamente (cron/queue):
  - Usa endpoints de consultas do PNCP.
  - Consulta por intervalo de datas de publicação/atualização (estratégia incremental).
  - Implementa tratamento de paginação.
- Armazenamento:
  - Tabela de licitações (ID PNCP, título, órgão, datas, valor estimado, UF/Município, modalidade, etc. apenas se existirem nos retornos da API).
  - Tabela de histórico de sincronizações (timestamp, número de itens, status, erro).

### 8.4. Matching Filtros x Licitações

- Para cada licitação recém-inserida/atualizada:
  - Avaliar:
    - Se o texto/título contém as palavras-chave do filtro (case-insensitive; OR/AND simples).
    - Se UF/Município batem com o filtro.
    - Outros parâmetros (se usados).
  - Registrar em tabela de associação: `filtro_id`, `licitacao_id`, data de detecção.

### 8.5. Caixa de Entrada de Oportunidades

- Lista de licitações detectadas para o usuário:
  - Colunas: título, órgão, UF, data de publicação, data limite, valor estimado (se houver), filtro que capturou.
  - Filtros por:
    - Filtro de monitoramento.
    - Status interno no funil.
    - Período de publicação.
- Ações:
  - Ver detalhes (abre tela de detalhe).
  - Atualizar status no funil.
  - Atribuir responsável.

### 8.6. Módulo de Gestão da Licitação

- Campos por oportunidade:
  - Status (Novo, Em análise, Preparando proposta, Enviada, Resultado, Arquivada).
  - Responsável (usuário da organização).
  - Valor estimado interno (manual) e/ou valor do edital, se fornecido.
  - Probabilidade de ganho (campo manual 0–100%).
  - Data-limite interna (prazo de entrega de proposta).
  - Observações / comentários.
- Histórico de alterações (log simples):
  - Mudanças de status.
  - Mudança de responsável.

### 8.7. Notificações

- Configuração de preferências de notificação por usuário:
  - Receber alertas:
    - Imediato (assim que encontrar licitação).
    - Diário (resumo).
    - Nunca (somente ver na plataforma).
- Geração de e-mails com:
  - Lista de novas licitações.
  - Link para acessar a plataforma e/ou link direto do PNCP.

### 8.8. Dashboard e Relatórios Simples

- Indicadores básicos por organização:
  - Licitações encontradas no período.
  - Licitações por status no funil.
  - Licitações por UF/município (contagem).
- Exportação CSV simples da lista de oportunidades filtradas.

## 9. Requisitos Não Funcionais

- **Segurança**
  - Autenticação segura (JWT/OAuth2 no backend).
  - Criptografia em trânsito (HTTPS).
  - Isolamento de dados por organização (multi-tenant).

- **Performance**
  - Coleta incremental para não reprocessar todo o histórico.
  - Capacidade de lidar com paginação grande sem travar (jobs assíncronos).

- **Disponibilidade e Resiliência**
  - Tratamento de erros da API PNCP:
    - Requisições com retry e backoff.
    - Log de falhas por endpoint.
  - Possibilidade de retomar sincronização de onde parou.

- **Observabilidade**
  - Log estruturado das chamadas à API PNCP.
  - Métricas de quantas licitações foram sincronizadas por job.
  - Alerta interno em caso de falhas repetidas.

## 10. Integrações

- **Integração principal**:
  - API de Consultas PNCP (Swagger oficial).
  - Utilizar apenas campos e filtros garantidos pela documentação; evolução posterior pode explorar recursos adicionais.

- **Integrações futuras**:
  - Webhooks para CRMs (para empurrar licitações selecionadas).
  - Canais de mensagem (WhatsApp, Telegram) via provedores externos.

## 11. Melhorias e Diferenciais (Pós-MVP)

- **Ranking de relevância**:
  - Score que combina:
    - Matching de palavras-chave (frequência).
    - Localização preferida.
    - Modalidade (se mais interessante para o cliente).
  - Ordenar lista por relevância, não apenas por data.

- **Perfis por cliente (para consultorias)**
  - Vários CNPJs por conta.
  - Filtros atrelados a cada cliente.
  - Relatórios segmentados por cliente.

- **Insights históricos**
  - Histórico de licitações por órgão, modalidade, UF.
  - Volume médio de oportunidades por mês.

- **Sugestão de licitações similares**
  - Se o usuário marcou licitações como “boas” ou participou, sugerir outras semelhantes (por textos e órgãos).

- **Análises simples de prazo**
  - Destacar licitações “críticas” por proximidade da data limite (se disponível).

## 12. Roadmap Inicial (Macro)

1. **Mês 1**
   - Backend básico (usuários, organizações).
   - Módulo de filtros de monitoramento (CRUD).
   - Primeiro conector PNCP (consulta simples, manual).

2. **Mês 2**
   - Worker de sincronização periódica com PNCP.
   - Armazenamento de licitações e matching com filtros.
   - Lista de oportunidades (caixa de entrada).

3. **Mês 3**
   - Módulo de gestão da licitação (funil + campos principais).
   - Notificações por e-mail.
   - Dashboard simples.

4. **Mês 4**
   - Multiusuário por organização com papéis.
   - Melhorias de performance e observabilidade.
   - Primeiras melhorias de relevância (ranking simples).

## 13. Riscos e Mitigações

- **Mudanças na API PNCP**
  - Risco: alterações de contrato ou limites.
  - Mitigação: camada de integração isolada + monitoramento de erros e update contínuo.

- **Limitações de filtros da API**
  - Risco: API não suportar todos os filtros desejados (ex.: município detalhado em todos os casos).
  - Mitigação: deixar claro no produto quais filtros dependem da API; adaptar UI ao que a API permite.

 - **Alta carga em jobs de sincronização**
  - Risco: tempo de sincronização aumentar com o crescimento de dados.
  - Mitigação: janelas de tempo menores, indexação adequada, paralelização controlada.

- **Baixa adesão ao módulo de gestão**
  - Risco: usuários usarem só monitoramento, não o funil.
  - Mitigação: onboarding guiado, templates de boas práticas, valor evidente dos indicadores que dependem do funil.

## 14. Arquitetura Técnica e Infraestrutura

- **Plataforma de deploy**: todos os serviços serão centralizados no **Railway**, incluindo:
  - Backend (API) em FastAPI.
  - Frontend em Next.js (React + TypeScript).
  - Worker(s) de jobs assíncronos (sincronização PNCP, tarefas de IA pesadas).
  - Banco de dados **PostgreSQL** e **Redis** (para filas de jobs e cache, se necessário).

- **Backend (FastAPI)**:
  - Implementa autenticação, autorização, regras de negócio, integrações com PNCP e exposição de endpoints para IA.
  - Organização modular em domínios: `auth`, `organizations`, `filters`, `tenders`, `opportunities`, `admin`, `ai`.

- **Frontend (Next.js)**:
  - SPA/SSR para telas de login, filtros, lista de licitações, funil, dashboards e administração.
  - Comunicação exclusivamente com a API FastAPI; o frontend não acessa diretamente o banco.

- **Banco de dados (PostgreSQL no Railway)**:
  - Armazena entidades de negócio (usuários, organizações, planos, filtros, licitações, oportunidades, jobs, notificações).
  - Suporte a **extensão vetorial** (como `pgvector`) para indexação de embeddings usados pelos agentes de IA.

- **Jobs assíncronos**:
  - Uso de um worker em Python (ex.: Celery ou RQ) hospedado no Railway, consumindo filas em Redis.
  - Responsável por sincronizações PNCP periódicas, pré-processamento de editais, cálculos pesados e tarefas de IA em lote.

- **Observabilidade**:
  - Logs estruturados e métricas técnicas expostas pelo backend/worker.
  - Integração futura com dashboards externos (Railway/third-party) para monitorar falhas de jobs e uso da API PNCP.

## 15. IA, Modelos e Módulos Comerciais

- **Camada de IA desacoplada**:
  - Implementada em Python com **LangChain** para orquestrar agentes e ferramentas (tools) que acessam PNCP, Postgres, histórico de propostas e pesquisas de preços.
  - Uso de **OpenRouter** como camada de acesso a múltiplos LLMs (OpenAI, Gemini, etc.), evitando acoplamento a um único provedor.

- **Multi-LLM via OpenRouter**:
  - Configuração de um modelo padrão por plano (ex.: `default_llm_model`) armazenado em banco.
  - Cada organização pode, opcionalmente, ter um modelo customizado.
  - Os agentes de IA obtêm o modelo a partir das configurações do plano/organização, permitindo troca de modelo sem alteração de código.

- **Principais agentes de IA previstos** (pós-MVP, ativados por módulo):
  - **Leitor de Edital**: sumariza, extrai campos estruturados (datas, modalidade, documentos obrigatórios), gera checklist e responde perguntas sobre o edital via RAG (PNCP + texto do edital + embeddings em Postgres).
  - **Proposta de Preço**: sugere estrutura de proposta e preços com base em regras e histórico do cliente, combinando dados internos, pesquisas de mercado e LLM.
  - **Pesquisa de Preços**: consolida dados de mercado (APIs, web scraping permitido, bases internas) e usa IA para normalizar descrições e identificar intervalos de preços típicos.

- **Planos e módulos de IA (feature gating)**:
  - O acesso a cada agente de IA é controlado por **módulos** associados a **planos** de assinatura.
  - Modelo de dados inclui:
    - `plans`: definição de planos (nome, preço, modelo LLM padrão, limites de uso).
    - `plan_features`: quais módulos cada plano inclui (ex.: `IA_EDITAL_READER`, `IA_PRICING`, `IA_MARKET_RESEARCH`).
    - `organizations`: vínculo de cada cliente a um plano.
    - `organization_features` (opcional): módulos extras habilitados individualmente por organização.
  - Endpoints de IA verificam se a organização possui a feature habilitada antes de executar o agente (retornando erro 403 se não tiver acesso).

- **Administração de planos e módulos**:
  - Tela e API de **administração** para gestão de planos, recursos de IA e vínculos com organizações:
    - CRUD de planos e configuração do modelo LLM padrão por plano.
    - Gestão de quais módulos de IA estão incluídos em cada plano.
    - Atribuição e mudança de plano por organização.
    - Ativação/desativação de módulos extras por cliente (add-ons).
  - No frontend principal, os botões/ações de IA são exibidos ou desabilitados de acordo com as permissões da organização, além da validação obrigatória no backend.
