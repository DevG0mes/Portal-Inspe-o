# Persistência e serviços locais

## Inicialização

```powershell
docker compose --env-file .env -f infra/compose.yaml up -d --build --wait
pnpm build
pnpm --filter @portal/api db:migrate
pnpm --filter @portal/api start
```

`db:migrate` aplica apenas migrações pendentes. A API não cria ou atualiza schema automaticamente. Não usar `schema:update --run` para substituir migrações. O comando deve anteceder o start na implantação.

## Camada de banco

- `database/base.entity.ts`: UUID criado na aplicação e instantes persistidos em `timestamptz`.
- `database/mikro-orm.config.ts`: schemas explícitos e lista explícita de migrações, funcionando em TypeScript e no build ESM.
- `database/database.module.ts`: uma instância de ORM por processo; cada requisição recebe seu próprio `RequestContext` na composição da API.
- `database/transaction.service.ts`: transação do caso de uso; o mesmo EntityManager deve ser passado para a auditoria.
- Processadores assíncronos futuros devem criar um EntityManager isolado por job; nunca compartilhar identity map entre jobs.

## Auditoria

`AuditService.record(input, em?)` registra ator (ou sistema), instante, ação, recurso, identificador, requestId e alterações sanitizadas. Campos de credencial e conteúdos binários são omitidos recursivamente. O serviço não oferece operações de alteração ou exclusão.

A primeira migração cria a tabela `audit_event`, índices e triggers que rejeitam `UPDATE`, `DELETE` e `TRUNCATE`, inclusive por SQL direto. Isso protege contra operações comuns da aplicação; um administrador do banco ainda controla o schema e seus privilégios. Permissões de banco para produção serão endurecidas na etapa de implantação.

Um evento ligado a uma operação de negócio deve usar a mesma transação. Se a operação falhar, o registro é revertido junto com ela. Eventos operacionais independentes podem ser gravados fora de uma transação de negócio.

## Integração

```powershell
pnpm test:integration
```

A suíte cria um banco `portal_test_<uuid>` novo, com nome gerado internamente, para testar migrações e rollback. Ao final, fecha o ORM e remove somente esse banco. A credencial local precisa poder criar e remover esses bancos de teste; não executar essa suíte com credenciais de produção.

O teste de MinIO cria um bucket aleatório, grava e lê um objeto, e remove apenas esse objeto e bucket. Não usa o bucket de evidências do portal. O teste de saúde verifica HTTP real com PostgreSQL, Redis e armazenamento.

## MinIO local

O download das imagens históricas retornou acesso negado tanto no Docker Hub quanto no Quay. A configuração local agora compila a revisão `7aac2a2c5b7c882e68c1ce017d8256be2feea27f` do [repositório oficial](https://github.com/minio/minio), preserva sua licença e executa como usuário sem privilégios. As imagens base também estão fixadas por digest.

O projeto oficial está arquivado e sua documentação orienta distribuição da comunidade por código-fonte. Esta construção resolve o ambiente de desenvolvimento; a escolha de armazenamento mantido para produção deverá ser revista na etapa de implantação. O acesso de arquivos continuará encapsulado pelo adaptador S3 previsto no plano.

Não executar `docker compose down -v` como diagnóstico: esse comando apagaria os dados locais persistidos.
