# Progresso — plano: docs/superpowers/plans/2026-10-21-portal-inspecao-seguranca.md

## Retomada em 27/10/2026

- Histórico inicial: `f4d9493` (especificação), `41b97ea` (plano). Não havia aplicações ou manifestos de dependências.
- Usuário escolheu trabalhar nesta pasta em nova branch, sem worktree. Branch: `codex/portal-foundation`.
- Estado inicial da retomada: tarefa 1 em andamento; demais tarefas não iniciadas.
- Ambiente inicial: Node 24.22.1 e pnpm 11.25.0 disponíveis; Docker ainda ausente. A instalação e validação posteriores estão registradas abaixo.

## Decisões

- Execução inline do plano, preservando fronteiras entre aplicações e pacotes. A pasta `.turbo` preexistente é cache e passa a ser ignorada.
- TypeScript permanece na série 6 prevista no plano (6.0.3), embora o registro já publique a série 7.
- Health checks usam `/api/health/live` e `/api/health/ready`, conforme a interface pública da tarefa 1; o texto que omite `/api` é interpretado como relativo ao prefixo global.
- Inicialização de banco não usa SQL manual: alterações de schema ficam para migrações na tarefa 2. Bucket será criado de forma controlada pela infraestrutura de arquivos, sem política pública.
- Compose local não é configuração de produção; credenciais de exemplo devem ser substituídas.
- O worker inicial usa BullMQ diretamente e apenas prepara a fila; a composição NestJS e os processadores serão adicionados com os jobs de domínio. Não há consumo silencioso de jobs ainda não implementados.
- A sondagem MinIO usa `/minio/health/ready` com cancelamento real de HTTP. Ela verifica disponibilidade do serviço; autorização de buckets e uploads será validada na tarefa de arquivos.

## Dependências entre tarefas

- 1 → 2–14: workspace, configuração validada e contratos compartilhados.
- 2–4 → 5–14: persistência, auditoria, identidade e escopo precisam anteceder dados de negócio.
- 5 → 7/9: formato de versão e motor de regras devem ser compartilhados sem confiar na avaliação do cliente.
- 8 → 9: atribuições recorrentes usam unicidade de ocorrência; conclusão possui idempotência própria.
- 9 → 10–13: evidências e não conformidades mantêm histórico e autorização nos relatórios.
- 10–13 → 14: validação final exige serviços reais e caminho crítico completo.

## Entrega da base

- Criados os workspaces de API NestJS, interface Next.js, worker BullMQ e pacotes compartilhados; dependências exatas e lockfile versionável.
- Criados scripts de desenvolvimento, build, lint, tipos, formatação e testes; configuração ESM estrita e variáveis de ambiente validadas sem exposição de valores inválidos.
- API oferece `GET /api/health/live` (200 enquanto o processo responde) e `GET /api/health/ready` (200 ou 503 com estados de PostgreSQL, Redis e MinIO).
- Interface inicial responsiva identifica o ambiente em preparação. Não há login, indicadores ou fluxos de negócio nesta entrega.
- Compose local define os três serviços, volumes persistentes e portas em loopback. O SDK MinIO está disponível para a futura integração de arquivos; a sondagem atual é HTTP cancelável.
- Revisão independente encontrou conexão pendente na sondagem MinIO; corrigida com AbortSignal.timeout e teste contra servidor silencioso. Ajustadas também as descrições do worker e do carregamento de ambiente.

## Evidências de verificação em 27/10/2026

- Antes da implementação: testes de configuração, API e página falharam pela ausência dos módulos correspondentes.
- `pnpm test`: 5 testes passaram (4 de configuração e 1 de interface).
- `pnpm test:e2e`: 4 testes passaram (3 de contrato HTTP e 1 de cancelamento real de conexão).
- `pnpm lint`: passou.
- `pnpm typecheck`: 7 tarefas passaram.
- `pnpm format:check`: passou.
- `pnpm peers check`: sem incompatibilidades.
- `pnpm build`: passou após a correção da sondagem; 5 tarefas aprovadas, incluindo os builds de API, worker e interface.
- Execução dos testes HTTP exigiu permissão fora do sandbox: loopback inicialmente retornou EACCES. Isso não era falha da aplicação.

## Pendência inicial da tarefa 1 — resolvida

Na primeira sessão Docker não estava instalado. Depois da instalação pelo usuário, o motor iniciou após reiniciar o Docker Desktop: a tentativa anterior havia ocorrido antes da instalação do WSL. Nenhuma distribuição WSL foi removida e não houve reset de volumes.

## Continuação com Docker em 27/10/2026

- Docker Desktop 4.97.0, Engine 29.9.2 e Compose 5.6.1 detectados e operacionais.
- `.env` local criado com credenciais aleatórias e ignorado pelo Git; valores não foram impressos nos logs.
- Imagem histórica MinIO indisponível no Docker Hub (acesso negado) e Quay (401). Ruling: construir a fonte oficial em revisão fixa, com imagens base fixadas por digest, licença incluída e usuário não privilegiado — preserva o serviço previsto na especificação sem adotar um espelho desconhecido. A decisão de armazenamento de produção permanece para a etapa de implantação.
- PostgreSQL, Redis e MinIO saudáveis via Compose; API compilada respondeu `ok` em live e ready, com os três serviços `up`.
- Tarefa 2 implementada: MikroORM 7.2.5, schemas explícitos, base UUID/timestamptz, transações, RequestContext por requisição, módulo de auditoria, sanitização recursiva e migração inicial append-only.
- Migração aplicada no banco local do portal; startup da API não altera schema implicitamente.
- Testes destrutivos de migração executados exclusivamente em banco temporário criado pela suíte. Bucket de teste também é temporário e não usa o armazenamento de evidências do portal.
- Revisão independente: nenhum defeito bloqueador; sugestão de fixar digests das imagens base incorporada.
- Ruling de integração: fundação anterior estava sem commit; as tarefas 1 e 2 são agrupadas em um commit coerente, pois a composição atual da API depende dos novos módulos. Tarefas 1 e 2 concluídas; próxima tarefa: identidade, autenticação e sessões (tarefa 3).

### Verificação da continuação

- `docker compose --env-file .env -f infra/compose.yaml config --quiet`: aprovado.
- `docker compose ... up -d --build --wait`: serviços saudáveis; código oficial do MinIO compilado com sucesso.
- `pnpm test:integration`: 8 testes aprovados, incluindo schema alinhado à migração, HTTP concorrente isolado, storage real, rollback e up/down/up.
- `pnpm test`: 8 testes aprovados.
- `pnpm test:e2e`: 4 testes aprovados.
- `pnpm lint`, `pnpm typecheck` e `pnpm build`: aprovados após integrar persistência à API.
- `pnpm --filter @portal/api db:migrate`: migração inicial aplicada.
- HTTP real na API compilada: `/api/health/live` e `/api/health/ready` retornaram `ok`.
- Verificação final: 20 testes aprovados (8 unitários/interface, 4 HTTP, 8 de integração); lint, tipos e formatação aprovados. Reconstrução do MinIO por digest aprovada.
- Snapshots automáticos de migração desativados durante a execução; arquivos temporários antigos ignorados para não poluir o controle de versão.
