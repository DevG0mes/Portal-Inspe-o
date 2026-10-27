# Organização, usuários e autorização por escopo

## Estado e fronteiras

A tarefa 4 entrega APIs para usuários, unidades, setores e vínculos. As telas administrativas pertencem à tarefa 6. `identity/` mantém usuários, `organization/` mantém estrutura e vínculos, e `access/` centraliza as decisões de autorização. Os contratos públicos ficam em `packages/contracts`.

`OrganizationService` cuida de unidades e setores. `MembershipsService` cuida de permissões explícitas. Controladores validam o transporte e delegam casos de uso; serviços também revalidam autorização para não depender exclusivamente dos guards.

## Matriz de acesso

| Operação                            | Colaborador                               | Gestor                                    | Administrador                                  |
| ----------------------------------- | ----------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Consultar unidades                  | Somente vínculos ativos                   | Somente vínculos ativos                   | Global, auditado                               |
| Consultar setores                   | Somente setores autorizados               | Somente setores autorizados               | Global, auditado                               |
| Administrar usuários e vínculos     | Não                                       | Não                                       | Sim                                            |
| Administrar unidades e setores      | Não                                       | Não                                       | Sim                                            |
| Validar unidade/setor para operação | Ambos precisam estar ativos e autorizados | Ambos precisam estar ativos e autorizados | Combinação ativa e válida, com bypass auditado |

A política consulta o estado e o perfil atuais do usuário no banco. Não aceita um perfil ADMIN apenas porque ele aparece em um objeto de principal antigo. Usuários inativos ou com troca de senha pendente não recebem acesso pelo serviço de política.

Um vínculo com a unidade não autoriza seus setores automaticamente. Há duas entidades:

- `UnitMembership`: usuário, unidade e estado do vínculo.
- `SectorMembership`: vínculo de unidade, setor e estado do vínculo.

O setor deve pertencer à mesma unidade do vínculo pai. A API valida a combinação e a migração 003 adiciona uma restrição por trigger no PostgreSQL. Relacionamentos de setor e vínculos não podem ser reapontados para outra unidade ou usuário. Para mudar a associação, desativar o vínculo antigo e conceder o novo.

## Consultas e paginação

As listas retornam `{ data, total, page, pageSize }`. A página começa em 1, o tamanho padrão é 20 e o máximo é 100. A ordenação usa nome/data e identificador como desempate estável. `isActive` recebe as strings `true` ou `false` na URL. Campos inesperados e identificadores inválidos retornam 400.

Filtros de escopo são incorporados às consultas SQL antes de carregar registros, contar resultados ou paginar. A busca `q` trata `%`, `_` e barra invertida como texto literal. Não há filtragem de autorização apenas no navegador nem depois de paginar.

Administradores podem consultar registros inativos para administrar o histórico. Colaboradores e gestores recebem apenas recursos ativos com vínculos ativos. O estado isolado de um vínculo não comprova acesso efetivo: usuário, unidade, setor e vínculo pai também precisam estar ativos.

## Rotas

Todas as rotas abaixo exigem autenticação e troca de senha concluída. Alterações usam JSON, inclusive DELETE com corpo vazio `{}`. DELETE é sempre desativação lógica; não apaga registros.

### Usuários — somente administrador

| Método e rota                        | Operação                                                  |
| ------------------------------------ | --------------------------------------------------------- |
| `GET /api/users`                     | Lista paginada; filtros `q`, `role`, `isActive`           |
| `POST /api/users`                    | Cria com `name`, `email`, `password` e `role` opcional    |
| `GET /api/users/:id`                 | Consulta identidade segura                                |
| `PATCH /api/users/:id`               | Altera `name`, `email`, `role` e/ou `isActive`            |
| `DELETE /api/users/:id`              | Desativa                                                  |
| `POST /api/users/:id/reset-password` | Redefine com `newPassword` e exige troca no próximo login |

Novos usuários recebem senha temporária com troca obrigatória. Hashes, identificadores secretos de sessão e contadores de falhas não aparecem nos DTOs. Desativação, alteração de perfil ou de e-mail revogam sessões na mesma transação. Reativar o usuário não revalida cookies antigos.

Não é permitido desativar ou rebaixar o último administrador ativo. Alterações administrativas de usuários usam um lock transacional para preservar essa regra inclusive sob concorrência. A criação do primeiro administrador continua sendo o [comando local de bootstrap](authentication.md).

### Estrutura organizacional

| Método e rota                                           | Operação                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/organization/units`                           | Lista unidades no escopo; filtros `q`, `isActive`               |
| `GET /api/organization/units/:id`                       | Consulta unidade no escopo                                      |
| `POST /api/organization/units`                          | Administrador cria com `name`                                   |
| `PATCH /api/organization/units/:id`                     | Administrador altera `name` e/ou `isActive`                     |
| `DELETE /api/organization/units/:id`                    | Administrador desativa                                          |
| `GET /api/organization/sectors`                         | Lista setores no escopo; filtros `unitId`, `q`, `isActive`      |
| `GET /api/organization/sectors/:id`                     | Consulta setor no escopo                                        |
| `GET /api/organization/units/:unitId/sectors/:sectorId` | Valida combinação operacional por `ScopeGuard` e consulta setor |
| `POST /api/organization/sectors`                        | Administrador cria com `unitId`, `name`                         |
| `PATCH /api/organization/sectors/:id`                   | Administrador altera `name` e/ou `isActive`                     |
| `DELETE /api/organization/sectors/:id`                  | Administrador desativa                                          |

Nomes são aparados, normalizados em Unicode NFC e comparados sem distinguir maiúsculas na chave de unicidade. Unidades têm nomes únicos; setores têm nomes únicos dentro da unidade. O mesmo nome de setor pode existir em unidades distintas. Conflitos retornam 409 e a transação é revertida.

### Vínculos — somente administrador

| Coleção                                | Concessão por POST             | Filtros de GET                 |
| -------------------------------------- | ------------------------------ | ------------------------------ |
| `/api/organization/unit-memberships`   | `userId`, `unitId`             | `userId`, `unitId`, `isActive` |
| `/api/organization/sector-memberships` | `userId`, `unitId`, `sectorId` | `userId`, `unitId`, `isActive` |

Ambas as coleções oferecem GET paginado, GET `/:id`, PATCH `/:id` com `isActive` e DELETE `/:id`. Repetir uma concessão reutiliza a associação existente, preservando identificador e data de criação. A concessão exige recursos ativos; o setor também exige vínculo de unidade ativo.

Revogar o vínculo de unidade desativa os vínculos de setor correspondentes na mesma transação. Reativar apenas o vínculo de unidade não restaura setores implicitamente; cada setor deve ser concedido novamente. Desativar a unidade ou o setor bloqueia o acesso operacional, mantendo os registros e seus vínculos para consulta histórica.

## Auditoria e concorrência

Alterações registram ator, recurso, requestId e estado relevante. Consultas administrativas globais também são auditadas. Não há exclusão física dos vínculos, usuários ou estrutura por esses endpoints.

As operações de vínculo adquirem locks na ordem usuário → unidade → setor, quando aplicável. Vínculos lidos antes de esperar o lock são recarregados depois, para que o snapshot do ORM não descarte uma atualização concorrente. SQL que precisa participar da transação usa `em.execute`; `em.getConnection().execute` não deve ser usado para locks transacionais sem contexto explícito.

## Verificação

`access-scope.e2e-spec.ts` testa API real e PostgreSQL em banco temporário. Inclui matriz de perfis, unidade permitida com setor não permitido, combinações incompatíveis, filtros e totais, unicidade, desativação, reset, histórico e condições de corrida. A suíte de integração verifica alinhamento do schema e down/up da cadeia inteira de migrações exclusivamente no banco de teste.
