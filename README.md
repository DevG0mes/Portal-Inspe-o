# Portal de Inspeção de Segurança

Portal interno para programar inspeções, registrar evidências e acompanhar não conformidades até a validação das ações corretivas.

## Estado do desenvolvimento

O repositório começou com a especificação e um plano de 14 tarefas. Fundação, autenticação, administração de usuários e organização, formulários versionados e motor de regras estão implementados na API, na branch `codex/portal-foundation`. A interface oferece login, troca de senha e administração de usuários, unidades, setores e vínculos. O construtor visual permite editar, simular e publicar versões de formulários. Programações únicas/recorrentes e atribuições já são materializadas pelo worker. A execução de inspeções é a próxima etapa. Consulte [o registro de progresso](docs/development/progress.md) antes de retomar trabalho.

## Requisitos

- Node.js 24 LTS.
- pnpm 11.25.0, conforme `packageManager`.
- Docker com Compose v2 para PostgreSQL, Redis e MinIO.

## Ambiente local

Na raiz do repositório, no PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edite .env e substitua as senhas de exemplo.
pnpm install
docker compose --env-file .env -f infra/compose.yaml up -d --build --wait
pnpm build
pnpm --filter @portal/api db:migrate
pnpm dev
```

A API, o worker e a interface carregam `.env` da raiz por seus scripts de desenvolvimento. A infraestrutura só publica portas em loopback; este Compose é de desenvolvimento, não uma implantação de produção. Não remova volumes para solucionar erros: eles contêm os dados locais.

A primeira construção do MinIO compila o código oficial e pode levar alguns minutos. A revisão do código e os digests das imagens base estão fixados em `infra/minio/Dockerfile`, porque as imagens da comunidade não estão disponíveis nos registros originalmente usados. Consulte [o registro operacional](docs/development/database.md) para migrações e testes reais.

Endereços locais: interface em `http://127.0.0.1:3000`, API em `http://127.0.0.1:3001/api` e console do armazenamento em `http://127.0.0.1:9001`. A interface oferece login em `/login`; crie o primeiro administrador seguindo o guia abaixo.

## Estrutura

```text
apps/
  api/          API REST NestJS; autorização e regras de negócio
  web/          Interface Next.js, em português brasileiro
  worker/       Processamento assíncrono, separado da API
packages/
  config/       Validação tipada de variáveis de ambiente
  contracts/    Contratos públicos compartilhados, sem persistência
  form-engine/  Validação e avaliação pura de formulários, API e prévia
  scheduling/   Calendário e contratos puros de recorrência
  ui/           Componentes e tokens visuais compartilhados
  testing/      Utilitários reutilizáveis de teste
infra/          Serviços locais e configuração operacional
docs/
  development/  Convenções, decisões e progresso verificável
  superpowers/  Especificação e plano originais
```

## Verificações

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm build
pnpm format:check
pnpm test:browser
```

Os testes HTTP sobem uma API real em porta temporária, com sondagens controladas. `test:integration` exige o Compose saudável e verifica serviços reais, armazenamento, transações, migrações e isolamento de requisições. Seus recursos temporários são removidos ao final, sem apagar os volumes ou tabelas do banco local do portal.

Os testes HTTP de autenticação também usam PostgreSQL real em banco temporário. Para criar a primeira conta administrativa e testar os endpoints, siga [o guia de autenticação](docs/development/authentication.md). Não há senha padrão nem cadastro público.

## Documentação

- [Especificação funcional](docs/superpowers/specs/2026-10-21-portal-inspecao-seguranca-design.md).
- [Plano de implementação](docs/superpowers/plans/2026-10-21-portal-inspecao-seguranca.md).
- [Convenções de código](docs/development/conventions.md).
- [Autenticação e primeiro administrador](docs/development/authentication.md).
- [Organização, usuários e permissões](docs/development/organization.md).
- [Formulários, regras e versões](docs/development/forms.md).
- [Construtor visual e recuperação de conflitos](docs/development/form-builder.md).
- [Interface, sessão e testes de navegador](docs/development/web.md).
- [Programação, recorrência e worker](docs/development/scheduling.md).
- [Progresso e decisões](docs/development/progress.md).
