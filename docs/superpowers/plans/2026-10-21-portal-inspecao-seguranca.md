# Portal de Inspeção de Segurança — Plano de Implementação

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [x]`) para acompanhamento.

**Objetivo:** Entregar um portal web interno para criar formulários versionados, programar e executar inspeções de segurança, tratar não conformidades e acompanhar indicadores por escopo organizacional.

**Arquitetura:** Monorepo TypeScript com Next.js para a interface, NestJS como monólito modular e um worker NestJS/BullMQ para tarefas assíncronas. PostgreSQL com MikroORM mantém dados transacionais, Redis mantém filas e MinIO armazena evidências e relatórios; todas as operações passam pela API e pelo controle de acesso por perfil e escopo.

**Stack:** Node.js 24 LTS, TypeScript 6, pnpm workspaces, Turborepo, Next.js 16, React, NestJS 12, MikroORM 7.2, PostgreSQL, Redis, BullMQ, MinIO, Vitest/Jest, Testing Library e Playwright.

**Especificação:** `docs/superpowers/specs/2026-10-21-portal-inspecao-seguranca-design.md`

## Restrições globais

- O sistema funciona somente online no MVP.
- A implantação inicial ocorre em servidor interno com Docker Compose e HTTPS no proxy reverso.
- Há três perfis fixos: `COLLABORATOR`, `MANAGER` e `ADMIN`.
- Usuários podem pertencer a múltiplas unidades e setores; toda consulta protegida aplica escopo no backend.
- Formulários publicados e inspeções concluídas são imutáveis; mudanças exigem nova versão ou reabertura auditada.
- O MVP usa somente notificações internas, sem e-mail.
- Fotos, evidências e relatórios são retidos por prazo indeterminado no MVP.
- Dependências usam versões exatas no `pnpm-lock.yaml`; pacotes MikroORM devem compartilhar a mesma versão.
- O código do backend usa ESM, `moduleResolution: nodenext`, UTC para persistência e locale `pt-BR` para apresentação.
- Alterações de schema ocorrem apenas por migrações do MikroORM; `schema:update --run` não será usado em produção.

## Foco da revisão

- Um usuário associado à unidade, mas não ao setor selecionado, recebe `403` e nenhum dado do setor é exposto.
- Uma requisição repetida para materializar recorrência ou concluir inspeção não cria duplicatas.
- Uma regra condicional maliciosa ou obsoleta enviada pelo cliente é recalculada no servidor.
- Evidência com tipo, tamanho ou vínculo inválido é rejeitada e não fica órfã no MinIO.
- Alterar ou arquivar formulário, usuário ou vínculo não modifica relatórios históricos existentes.

---

### Tarefa 1: Fundação do monorepo e ambiente local

**Arquivos:**
- Criar: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.editorconfig`, `.gitignore`, `.env.example`
- Criar: `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs`
- Criar: `apps/api/**`, `apps/web/**`, `apps/worker/**`
- Criar: `packages/contracts/**`, `packages/ui/**`, `packages/config/**`, `packages/testing/**`
- Criar: `infra/compose.yaml`, `infra/minio/init.sh`, `infra/postgres/init.sql`
- Criar: `apps/api/test/health.e2e-spec.ts`, `apps/web/src/app/page.test.tsx`

**Interfaces:**
- Produz: scripts raiz `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`; endpoints `GET /api/health/live` e `GET /api/health/ready`.

- [x] **Passo 1: Escrever testes de fumaça que falham**

  Testar que a API retorna `200` em `/health/live`, que `/health/ready` informa PostgreSQL, Redis e MinIO, e que a página inicial renderiza o nome do portal.

- [x] **Passo 2: Executar os testes e confirmar a falha**

  Executar: `pnpm test --filter api --filter web`

  Esperado: falha porque aplicações, rotas e página ainda não existem.

- [x] **Passo 3: Criar workspace, aplicações e configuração compartilhada**

  Fixar Node.js `24.x`, TypeScript `6.x`, NestJS `12.x`, Next.js `16.x` e MikroORM `7.2.x`; configurar aliases, lint, formatação e variáveis validadas.

- [x] **Passo 4: Criar infraestrutura local e health checks**

  Definir PostgreSQL, Redis e MinIO com volumes nomeados, health checks e credenciais apenas via ambiente. O readiness deve testar dependências sem expor segredos.

- [x] **Passo 5: Verificar a fundação**

  Executar: `docker compose -f infra/compose.yaml up -d && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

  Esperado: todos os serviços saudáveis e comandos concluídos sem erro.

- [x] **Passo 6: Commit**

  `git commit -m "chore: scaffold inspection portal workspace"`

### Tarefa 2: Persistência, entidades comuns e auditoria

**Arquivos:**
- Criar: `apps/api/src/database/mikro-orm.config.ts`
- Criar: `apps/api/src/database/base.entity.ts`, `apps/api/src/database/transaction.service.ts`
- Criar: `apps/api/src/audit/audit-event.entity.ts`, `audit.service.ts`, `audit.module.ts`
- Criar: `apps/api/src/database/migrations/Migration*.ts`
- Criar: `apps/api/test/database.integration-spec.ts`, `apps/api/src/audit/audit.service.spec.ts`

**Interfaces:**
- Produz: `BaseEntity { id, createdAt, updatedAt }`; `AuditService.record(input: AuditRecordInput, em?: EntityManager): Promise<void>`; migrações reproduzíveis.

- [x] **Passo 1: Escrever testes de persistência e auditoria que falham**

  Cobrir UUIDs, timestamps UTC, rollback transacional e evento de auditoria com ator, ação, recurso, identificador, requestId e alterações sanitizadas.

- [x] **Passo 2: Confirmar as falhas**

  Executar: `pnpm --filter api test database.integration-spec audit.service.spec`

- [x] **Passo 3: Implementar configuração MikroORM e base transacional**

  Configurar driver PostgreSQL, migrations, naming strategy, RequestContext por requisição e EntityManager isolado em jobs.

- [x] **Passo 4: Implementar auditoria append-only**

  Impedir update/delete comum de eventos e remover de diffs campos como senha, token, cookie e conteúdo binário.

- [x] **Passo 5: Gerar e testar a primeira migração**

  Executar banco vazio → migrate up → migrate down → migrate up.

  Esperado: schema reproduzível e testes aprovados.

- [x] **Passo 6: Commit**

  `git commit -m "feat: add persistence and audit foundation"`

### Tarefa 3: Identidade, autenticação e sessões

**Arquivos:**
- Criar: `apps/api/src/identity/user.entity.ts`, `session.entity.ts`, `identity.types.ts`
- Criar: `apps/api/src/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `session.guard.ts`
- Criar: `apps/api/src/auth/dto/login.dto.ts`, `change-password.dto.ts`, `reset-password.dto.ts`
- Criar: `packages/contracts/src/auth.ts`, `packages/contracts/src/user.ts`
- Criar: `apps/api/src/auth/*.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Produz: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/change-password`, `GET /api/auth/me`; `AuthenticatedPrincipal { userId, role, sessionId, mustChangePassword }`.

- [x] **Passo 1: Escrever testes que falham para login e sessão**

  Cobrir credenciais válidas, resposta genérica para credenciais inválidas, Argon2id, cookie HttpOnly/SameSite/Secure por ambiente, bloqueio temporário, revogação e troca obrigatória de senha.

- [x] **Passo 2: Confirmar as falhas**

  Executar: `pnpm --filter api test auth && pnpm --filter api test:e2e -- auth.e2e-spec`

- [x] **Passo 3: Implementar entidades e serviço de autenticação**

  Usar sessão opaca armazenada como hash, rotação após login e revogação por usuário. Nunca retornar hash de senha ou token em DTOs.

- [x] **Passo 4: Implementar endpoints e guard global**

  Permitir anonimamente apenas health e login. Se `mustChangePassword` for verdadeiro, permitir somente `/auth/me`, troca de senha e logout.

- [x] **Passo 5: Verificar segurança e contratos**

  Executar: `pnpm --filter api test && pnpm --filter api test:e2e`

  Esperado: casos válidos e ataques de enumeração/reuso cobertos.

- [x] **Passo 6: Commit**

  `git commit -m "feat: add local authentication and sessions"`

### Tarefa 4: Organização, usuários e autorização por escopo

**Arquivos:**
- Criar: `apps/api/src/organization/unit.entity.ts`, `sector.entity.ts`, `membership.entity.ts`
- Criar: `apps/api/src/organization/organization.service.ts`, `organization.controller.ts`, `organization.module.ts`
- Criar: `apps/api/src/access/access-policy.service.ts`, `roles.decorator.ts`, `scope.guard.ts`
- Criar: `apps/api/src/identity/users.controller.ts`, `users.service.ts`
- Criar: `packages/contracts/src/organization.ts`, `packages/contracts/src/access.ts`
- Criar: `apps/api/src/organization/*.spec.ts`, `apps/api/test/access-scope.e2e-spec.ts`

**Interfaces:**
- Consome: `AuthenticatedPrincipal`, `AuditService.record`.
- Produz: `AccessPolicy.assertUnitSector(principal, unitId, sectorId): Promise<void>`; CRUD paginado de usuários, unidades, setores e vínculos.

- [x] **Passo 1: Escrever matriz de autorização que falha**

  Cobrir os três perfis, múltiplos vínculos, setor pertencente a outra unidade, usuário inativo e o foco de revisão `unidade permitida + setor não permitido = 403`.

- [x] **Passo 2: Confirmar as falhas**

  Executar: `pnpm --filter api test organization access-policy && pnpm --filter api test:e2e -- access-scope.e2e-spec`

- [x] **Passo 3: Implementar modelo organizacional e consultas paginadas**

  Garantir unicidade de setor dentro da unidade e impedir vínculo incompatível entre unidade e setor.

- [x] **Passo 4: Implementar política central de acesso**

  Aplicar filtros de escopo na consulta SQL/MikroORM, não após carregar dados. Administrador ignora o filtro de escopo, mas continua auditado.

- [x] **Passo 5: Implementar administração de usuários e vínculos**

  Desativação revoga sessões; redefinição de senha marca troca obrigatória; remoção de vínculo não altera registros históricos.

- [x] **Passo 6: Verificar e commit**

  Executar: `pnpm --filter api test && pnpm --filter api test:e2e`

  `git commit -m "feat: add organization and scoped access"`

### Tarefa 5: Modelos de formulário, regras e versionamento

**Arquivos:**
- Criar: `apps/api/src/forms/entities/*.entity.ts`
- Criar: `apps/api/src/forms/form-template.service.ts`, `form-version.service.ts`, `rule-engine.service.ts`
- Criar: `apps/api/src/forms/forms.controller.ts`, `forms.module.ts`, `dto/*.ts`
- Criar: `packages/contracts/src/forms.ts`
- Criar: `apps/api/src/forms/*.spec.ts`, `apps/api/test/forms.e2e-spec.ts`

**Interfaces:**
- Produz: `RuleEngine.evaluate(version: FormVersionSnapshot, answers: AnswerInput[]): EvaluationResult`; endpoints administrativos de rascunho, pré-visualização, publicação e arquivamento; endpoint de leitura de versão publicada.

- [x] **Passo 1: Escrever testes que falham para tipos e regras**

  Cobrir texto, número, data, seleção, sim/não/não aplicável, obrigatoriedade, opções inválidas, condição em pergunta posterior, ciclo, referência removida e resposta que gera não conformidade.

- [x] **Passo 2: Escrever testes que falham para versionamento**

  Publicar v1, editar novo rascunho, publicar v2 e provar que o snapshot v1 permanece byte a byte equivalente.

- [x] **Passo 3: Implementar entidades e motor de regras puro**

  Separar avaliação de regras de persistência. O resultado deve informar perguntas visíveis, erros de validação e ocorrências de não conformidade determinísticas.

- [x] **Passo 4: Implementar workflow de rascunho e publicação**

  Publicação ocorre em transação, valida grafo e cria snapshot imutável com número sequencial por modelo.

- [x] **Passo 5: Verificar histórico e concorrência**

  Testar duas publicações concorrentes: uma vence e a outra recebe conflito `409`, sem números duplicados.

- [x] **Passo 6: Commit**

  `git commit -m "feat: add versioned conditional forms"`

### Tarefa 6: Estrutura visual, autenticação e administração básica

**Arquivos:**
- Criar: `apps/web/src/app/(auth)/login/page.tsx`, `change-password/page.tsx`
- Criar: `apps/web/src/app/(portal)/layout.tsx`, `dashboard/page.tsx`
- Criar: `apps/web/src/features/auth/**`, `features/users/**`, `features/organization/**`
- Criar: `packages/ui/src/**`
- Criar: `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/session.ts`
- Criar: `apps/web/src/**/*.test.tsx`, `apps/web/e2e/auth-admin.spec.ts`

**Interfaces:**
- Consome: contratos de autenticação, usuários e organização.
- Produz: shell responsivo com navegação por perfil, formulários acessíveis e cliente API tipado que preserva cookies e erros de domínio.

- [x] **Passo 1: Escrever testes de interface que falham**

  Cobrir login, erro genérico, troca obrigatória, navegação por perfil, tabelas paginadas e associação a múltiplas unidades/setores.

- [x] **Passo 2: Criar design tokens e componentes básicos**

  Implementar botão, campo, seleção, modal, tabela, badge, alerta, skeleton e feedback de erro com foco visível e navegação por teclado.

- [x] **Passo 3: Implementar autenticação e shell**

  Usar renderização no servidor quando apropriado, sem armazenar segredo de sessão em localStorage.

- [x] **Passo 4: Implementar telas administrativas de usuários e organização**

  Incluir estados vazio, carregando, erro, confirmação e sucesso; respeitar paginação e filtros da API.

- [x] **Passo 5: Verificar responsividade e acessibilidade**

  Executar: `pnpm test && pnpm build && pnpm test:browser`

  Esperado: fluxos passam em viewport móvel e desktop sem violações críticas de acessibilidade.

- [x] **Passo 6: Commit**

  `git commit -m "feat: add portal shell and user administration"`

### Tarefa 7: Construtor visual de formulários

**Arquivos:**
- Criar: `apps/web/src/app/(portal)/admin/forms/**`
- Criar: `apps/web/src/features/form-builder/**`
- Criar: `apps/web/src/features/form-preview/**`
- Criar: `apps/web/src/features/form-builder/*.test.tsx`
- Criar: `apps/web/e2e/form-builder.spec.ts`

**Interfaces:**
- Consome: endpoints e contratos de formulários da Tarefa 5.
- Produz: editor de seções/perguntas/opções, editor de condições, pré-visualização e publicação com tratamento de conflito.

- [ ] **Passo 1: Escrever testes que falham para o construtor**

  Cobrir inclusão, ordenação, edição, duplicação e remoção; bloquear dependência posterior/cíclica; exibir validação de publicação por campo.

- [ ] **Passo 2: Implementar editor de conteúdo**

  Manter IDs estáveis no rascunho e autosave com debounce, indicador de estado e proteção contra perda de alterações.

- [ ] **Passo 3: Implementar regras e pré-visualização**

  A pré-visualização usa o mesmo formato de regra do backend, mas a publicação sempre depende da validação definitiva da API.

- [ ] **Passo 4: Implementar publicação e histórico**

  Mostrar versões, autor, data e estado; em `409`, recarregar dados e orientar o administrador sem sobrescrever silenciosamente.

- [ ] **Passo 5: Verificar e commit**

  Executar: `pnpm --filter web test && pnpm --filter web test:e2e -- form-builder.spec.ts`

  `git commit -m "feat: add versioned form builder UI"`

### Tarefa 8: Programação de inspeções e recorrências

**Arquivos:**
- Criar: `apps/api/src/schedules/*.entity.ts`, `schedule.service.ts`, `recurrence.service.ts`, `schedules.controller.ts`
- Criar: `apps/worker/src/jobs/materialize-schedules.processor.ts`
- Criar: `packages/contracts/src/schedules.ts`
- Criar: `apps/api/src/schedules/*.spec.ts`, `apps/worker/src/jobs/*.spec.ts`
- Criar: `apps/web/src/features/schedules/**`, `apps/web/e2e/schedules.spec.ts`

**Interfaces:**
- Produz: `RecurrenceService.materialize(scheduleId, occurrenceAt, idempotencyKey): Promise<InspectionAssignment>`; CRUD de programação e lista de atribuições do colaborador.

- [ ] **Passo 1: Escrever testes de recorrência que falham**

  Cobrir ocorrência única, diária/semanal/mensal, vigência, prazo, timezone America/Sao_Paulo e repetição da mesma chave sem duplicata.

- [ ] **Passo 2: Implementar programação e materialização idempotente**

  Usar restrição única de banco para `(scheduleId, occurrenceAt)` e transação para criação da atribuição.

- [ ] **Passo 3: Implementar processador BullMQ**

  Jobs podem repetir após falha; resultado funcional continua exatamente uma ocorrência.

- [ ] **Passo 4: Implementar telas de programação e lista de atribuições**

  Gestor só seleciona formulários, responsáveis e escopos autorizados; colaborador vê próximas, pendentes e vencidas.

- [ ] **Passo 5: Verificar e commit**

  Executar: `pnpm --filter api test schedules && pnpm --filter worker test && pnpm --filter web test:e2e -- schedules.spec.ts`

  `git commit -m "feat: add inspection scheduling and recurrence"`

### Tarefa 9: Execução de inspeções, uploads e não conformidades

**Arquivos:**
- Criar: `apps/api/src/inspections/*.entity.ts`, `inspection.service.ts`, `inspections.controller.ts`
- Criar: `apps/api/src/files/file.service.ts`, `files.controller.ts`, `storage.adapter.ts`, `minio-storage.adapter.ts`
- Criar: `packages/contracts/src/inspections.ts`, `packages/contracts/src/files.ts`
- Criar: `apps/web/src/features/inspection-runner/**`
- Criar: `apps/api/src/inspections/*.spec.ts`, `apps/api/test/inspection.e2e-spec.ts`, `apps/web/e2e/inspection.spec.ts`

**Interfaces:**
- Consome: `RuleEngine.evaluate`, `AccessPolicy.assertUnitSector`.
- Produz: criar inspeção avulsa/atribuída, salvar rascunho com versão otimista, preparar/finalizar upload, concluir e reabrir inspeção.

- [ ] **Passo 1: Escrever testes do ciclo que falham**

  Cobrir escopo, autosave, conflito de versão, campos ocultos, obrigatórios, conclusão repetida, snapshot imutável, reabertura justificada e geração determinística de não conformidades.

- [ ] **Passo 2: Escrever testes de arquivo que falham**

  Rejeitar MIME/extensão/tamanho inválido, chave pertencente a outro usuário e finalização sem objeto; remover upload abandonado por job de limpeza.

- [ ] **Passo 3: Implementar domínio e endpoints de inspeção**

  Recalcular regras no backend dentro da transação de conclusão. Usar restrição única para impedir duas conclusões ou ocorrências iguais.

- [ ] **Passo 4: Implementar armazenamento MinIO**

  Expor URLs temporárias somente após autorização; promover upload temporário para vínculo definitivo de modo transacional compensável.

- [ ] **Passo 5: Implementar runner responsivo**

  Mostrar progresso, autosave, perda de conexão, validações por seção, fotos e confirmação final. Não prometer funcionamento offline.

- [ ] **Passo 6: Verificar e commit**

  Executar: `pnpm --filter api test && pnpm --filter api test:e2e -- inspection.e2e-spec && pnpm --filter web test:e2e -- inspection.spec.ts`

  `git commit -m "feat: add inspection execution and evidence uploads"`

### Tarefa 10: Planos de ação e validação gerencial

**Arquivos:**
- Criar: `apps/api/src/action-plans/*.entity.ts`, `action-plan.machine.ts`, `action-plan.service.ts`, `action-plans.controller.ts`
- Criar: `packages/contracts/src/action-plans.ts`
- Criar: `apps/web/src/features/action-plans/**`
- Criar: `apps/api/src/action-plans/*.spec.ts`, `apps/api/test/action-plans.e2e-spec.ts`, `apps/web/e2e/action-plans.spec.ts`

**Interfaces:**
- Produz: máquina de estados `OPEN | IN_PROGRESS | AWAITING_VALIDATION | COMPLETED`; indicador derivado `overdue`; comandos assign, start, comment, requestValidation, approve e return.

- [ ] **Passo 1: Escrever tabela de transições que falha**

  Testar ator permitido, origem/destino, justificativa obrigatória na devolução, evidência de correção e cálculo de vencimento sem substituir o estado.

- [ ] **Passo 2: Implementar máquina de estados pura**

  `transition(current, command, actor): TransitionResult` não acessa banco e rejeita toda transição não listada.

- [ ] **Passo 3: Implementar persistência e endpoints**

  Persistir histórico append-only na mesma transação da mudança; aplicar escopo do gestor e responsabilidade do colaborador.

- [ ] **Passo 4: Implementar interface operacional**

  Criar caixas por estado, detalhe com timeline, comentários, evidências, solicitação e decisão gerencial.

- [ ] **Passo 5: Verificar e commit**

  Executar: `pnpm --filter api test action-plans && pnpm --filter api test:e2e -- action-plans.e2e-spec && pnpm --filter web test:e2e -- action-plans.spec.ts`

  `git commit -m "feat: add corrective action workflow"`

### Tarefa 11: Notificações internas

**Arquivos:**
- Criar: `apps/api/src/notifications/notification.entity.ts`, `notification.service.ts`, `notifications.controller.ts`
- Criar: `apps/worker/src/jobs/deadline-notifications.processor.ts`
- Criar: `packages/contracts/src/notifications.ts`
- Criar: `apps/web/src/features/notifications/**`
- Criar: `apps/api/src/notifications/*.spec.ts`, `apps/web/src/features/notifications/*.test.tsx`

**Interfaces:**
- Produz: `NotificationService.emitOnce(eventKey, recipientId, payload): Promise<void>`; listar, contar não lidas, marcar uma/todas como lidas.

- [ ] **Passo 1: Escrever testes que falham para eventos e deduplicação**

  Cobrir atribuição, proximidade/vencimento, validação, aprovação e devolução; repetir job não duplica notificação.

- [ ] **Passo 2: Implementar geração transacional e jobs de prazo**

  Usar `eventKey` único por evento/destinatário. Link só é retornado se o destinatário ainda pode acessar o recurso.

- [ ] **Passo 3: Implementar central e indicador no frontend**

  Paginar resultados, permitir marcar como lida e tratar recurso que deixou de estar disponível.

- [ ] **Passo 4: Verificar e commit**

  Executar: `pnpm --filter api test notifications && pnpm --filter worker test && pnpm --filter web test notifications`

  `git commit -m "feat: add in-app notifications"`

### Tarefa 12: Métricas e painéis por perfil

**Arquivos:**
- Criar: `apps/api/src/analytics/analytics.service.ts`, `analytics.queries.ts`, `analytics.controller.ts`
- Criar: `packages/contracts/src/analytics.ts`
- Criar: `apps/web/src/features/dashboard/**`
- Criar: `apps/api/src/analytics/*.spec.ts`, `apps/api/test/analytics-scope.e2e-spec.ts`, `apps/web/e2e/dashboard.spec.ts`

**Interfaces:**
- Produz: `GET /api/analytics/summary`, `/trends`, `/nonconformities`, `/action-plans`; filtros tipados de período, unidade, setor, formulário, categoria e prioridade.

- [ ] **Passo 1: Escrever fixtures e testes de métricas que falham**

  Fixar fórmulas para taxa de conformidade e tempo médio de resolução; cobrir período vazio, timezone, registros arquivados e isolamento de escopo.

- [ ] **Passo 2: Implementar consultas agregadas**

  Aplicar filtros na consulta, índices comprovados por `EXPLAIN ANALYZE` e paginação para listas de detalhe.

- [ ] **Passo 3: Implementar painéis de colaborador, gestor e administrador**

  Cada visualização terá estado vazio, filtros persistidos na URL, tabela acessível equivalente aos gráficos e drill-down autorizado.

- [ ] **Passo 4: Verificar desempenho e autorização**

  Semear volume representativo e confirmar que nenhuma consulta retorna dados fora do escopo.

- [ ] **Passo 5: Commit**

  `git commit -m "feat: add scoped operational dashboards"`

### Tarefa 13: Exportações PDF e Excel

**Arquivos:**
- Criar: `apps/api/src/reports/report-request.entity.ts`, `reports.service.ts`, `reports.controller.ts`
- Criar: `apps/worker/src/jobs/generate-report.processor.ts`, `reports/pdf.renderer.ts`, `reports/xlsx.renderer.ts`
- Criar: `packages/contracts/src/reports.ts`
- Criar: `apps/web/src/features/reports/**`
- Criar: `apps/worker/src/reports/*.spec.ts`, `apps/api/test/reports.e2e-spec.ts`, `apps/web/e2e/reports.spec.ts`

**Interfaces:**
- Produz: solicitar exportação, consultar estado `QUEUED | PROCESSING | READY | FAILED`, baixar arquivo autorizado e reprocessar falha controlada.

- [ ] **Passo 1: Escrever testes de geração que falham**

  Validar workbook, cabeçalhos, filtros, locale, conteúdo do PDF de inspeção, evidências ausentes e acesso negado após mudança de escopo.

- [ ] **Passo 2: Implementar snapshot autorizado do pedido**

  Gravar filtros, solicitante e escopo no pedido; no download, revalidar autorização atual. Jobs repetidos substituem apenas o artefato do mesmo pedido.

- [ ] **Passo 3: Implementar renderizadores e armazenamento**

  Gerar arquivos no worker, salvar no MinIO, persistir checksum/tamanho e remover artefato parcial em falha.

- [ ] **Passo 4: Implementar experiência de exportação**

  Exibir fila, progresso por polling com backoff, erro acionável e download quando pronto.

- [ ] **Passo 5: Verificar e commit**

  Executar: `pnpm --filter worker test reports && pnpm --filter api test:e2e -- reports.e2e-spec && pnpm --filter web test:e2e -- reports.spec.ts`

  `git commit -m "feat: add asynchronous PDF and Excel reports"`

### Tarefa 14: Endurecimento, observabilidade e implantação

**Arquivos:**
- Criar: `apps/api/src/common/request-id.middleware.ts`, `logging.ts`, `rate-limit.config.ts`
- Criar: `apps/worker/src/health/**`
- Criar: `infra/Dockerfile.api`, `infra/Dockerfile.web`, `infra/Dockerfile.worker`, `infra/nginx.conf`
- Criar: `infra/compose.production.yaml`, `infra/scripts/backup.ps1`, `infra/scripts/restore-check.ps1`
- Criar: `docs/operations/deployment.md`, `backup-and-restore.md`, `incident-response.md`
- Criar: `tests/e2e/critical-path.spec.ts`, `tests/load/smoke.yml`

**Interfaces:**
- Consome: todos os fluxos anteriores.
- Produz: imagens imutáveis, deployment interno documentado, logs correlacionáveis, health checks e procedimentos verificáveis de backup/restauração.

- [ ] **Passo 1: Escrever teste ponta a ponta do caminho crítico**

  Administrador cria organização/usuários e publica formulário; gestor agenda; colaborador inspeciona com foto; sistema gera não conformidade; responsável corrige; gestor valida; relatório e métricas refletem o resultado.

- [ ] **Passo 2: Implementar proteções transversais**

  Adicionar requestId, logs JSON sanitizados, limites de corpo/upload, rate limit de autenticação, cabeçalhos de segurança e tratamento uniforme de erro.

- [ ] **Passo 3: Criar imagens e compose de produção**

  Executar como usuário não-root, usar Next.js standalone, health checks, secrets por arquivo/ambiente, volumes explícitos e migração como job único antes da API.

- [ ] **Passo 4: Criar e testar backup/restauração**

  Fazer backup consistente de PostgreSQL e MinIO, restaurar em ambiente descartável e comparar contagens e checksums de amostra.

- [ ] **Passo 5: Executar verificação final**

  Executar: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`

  Executar: `docker compose -f infra/compose.production.yaml config` e teste de carga de fumaça com usuários de múltiplos escopos.

  Esperado: tudo aprovado, zero acesso cruzado, zero duplicação em retries e documentação operacional reproduzível.

- [ ] **Passo 6: Commit**

  `git commit -m "chore: harden and package inspection portal"`

## Sequência de entrega

1. **Fundação:** tarefas 1–4 entregam ambiente, autenticação e autorização.
2. **Núcleo configurável:** tarefas 5–7 entregam formulários versionados e sua administração.
3. **Operação:** tarefas 8–11 entregam programação, inspeção, ações e notificações.
4. **Gestão:** tarefas 12–13 entregam métricas e relatórios.
5. **Produção:** tarefa 14 valida o fluxo completo e prepara a instalação interna.

Cada tarefa termina com testes e commit próprios. Nenhuma tela deve usar mocks permanentes depois que o contrato correspondente estiver disponível; fixtures locais permanecem apenas nos testes e no Storybook, caso ele seja adotado durante a execução.
