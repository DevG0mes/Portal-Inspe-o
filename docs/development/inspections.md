# Execução de inspeções — núcleo HTTP

Esta é a primeira parte da tarefa 9. O núcleo de persistência está separado da futura interface de preenchimento e do serviço de evidências. Não há upload, modo offline ou plano de ação nesta entrega.

## Contratos e organização

- `packages/contracts/src/inspections.ts`: respostas públicas tipadas.
- `apps/api/src/inspections/inspections.dto.ts`: validação estrita das entradas.
- `inspection.service.ts`: autorização, transações, revisão e ciclo de conclusão.
- `inspection.entity.ts`: rascunho mutável e conclusões imutáveis.
- `inspections.controller.ts` e `inspections.module.ts`: transporte e composição Nest.
- Migração `202610280003`: tabelas, chaves, índices e triggers de imutabilidade.

Todas as rotas exigem sessão com senha definitiva. A API é a autoridade de autorização, validação e avaliação das regras.

| Método e rota                        | Entrada                                          | Comportamento                                                           |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| POST `/api/inspections`              | `{unitId, sectorId, formId}` ou `{assignmentId}` | Cria inspeção avulsa ou retorna a inspeção compartilhada da atribuição. |
| GET `/api/inspections/:id`           | —                                                | Retorna versão fixada, rascunho e conclusões anteriores.                |
| PUT `/api/inspections/:id/draft`     | `{revision, answers}`                            | Salva a lista completa de respostas e incrementa a revisão.             |
| POST `/api/inspections/:id/complete` | `{revision, cycle}`                              | Reavalia regras no servidor e grava conclusão imutável.                 |
| POST `/api/inspections/:id/reopen`   | `{revision, reason}`                             | Gestor/administrador reabre com justificativa e inicia outro ciclo.     |

`answers` contém objetos `{questionId, value}`, com valor string, número finito ou null. IDs desconhecidos e duplicados são rejeitados no salvamento. Rascunhos incompletos ou semanticamente inválidos podem ser salvos; a conclusão exige respostas válidas para todas as perguntas visíveis obrigatórias.

## Autorização e versões

Uma inspeção avulsa fixa a versão publicada corrente sob lock do modelo. Uma inspeção atribuída usa exatamente a versão materializada pelo worker. Arquivar ou publicar outra versão não muda a inspeção existente.

Criador e responsáveis da atribuição podem editar, desde que conservem acesso à unidade e ao setor. Colaboradores alheios à inspeção não podem consultá-la, mesmo que tenham acesso ao setor. Gestores e administradores podem consultar e reabrir no escopo permitido; editar respostas exige ser criador ou responsável.

Atribuições futuras não podem ser iniciadas antes de `occurrenceAt`; atribuições canceladas não podem gerar uma nova inspeção. O atraso não bloqueia execução. Duas solicitações de início para a mesma atribuição são serializadas e retornam o mesmo ID.

## Revisão, conclusão e histórico

Cada mutação lê o estado sob lock de linha. Uma revisão vencida retorna 409; não há sobrescrita forçada nem merge automático. O cliente deverá preservar suas respostas em memória e oferecer recuperação explícita.

Locks compartilhados de usuário, unidade e setor seguem a mesma ordem das alterações de vínculos. Dados são atualizados antes de verificar permissões. Isso impede que uma operação prossiga com a autorização antiga após aguardar uma desativação ou revogação concorrente; inspeções diferentes ainda podem usar o mesmo escopo simultaneamente.

A conclusão usa `RuleEngine.evaluate` da versão fixada dentro da transação. Somente respostas aceitas e visíveis são gravadas na conclusão. Ocorrências são calculadas pelo servidor e armazenadas junto ao ciclo; a identidade de uma ocorrência é `(submissionId, questionId)`. O motor gera no máximo uma por pergunta. A futura etapa de planos de ação deverá referenciar essa identidade, sem recalcular versões históricas.

A chave única `(inspection_id, cycle)` impede duplicação. Repetir a conclusão com o mesmo ciclo e revisão de origem retorna a mesma conclusão. Depois da reabertura, uma solicitação de conclusão de ciclo anterior retorna 409.

Triggers PostgreSQL rejeitam UPDATE, DELETE e TRUNCATE de conclusões, incluindo suas respostas e ocorrências. A reabertura preserva todos os ciclos anteriores, incrementa ciclo/revisão e registra motivo, autor, instante e requestId na auditoria transacional. Respostas não são copiadas para logs de auditoria.

## Verificação e continuação

Os testes HTTP usam PostgreSQL descartável com migrações reais, contas fictícias e porta aleatória. Cobrem concorrência, validação, escopo revogado, publicação posterior, início compartilhado e antecipado, idempotência, reabertura e imutabilidade no banco.

Ainda faltam para concluir a tarefa 9: listagem paginada de inspeções, integração das atribuições com estado de execução, tela responsiva com autosave e recuperação, observações por pergunta, evidências privadas no MinIO, promoção compensável, limpeza de uploads abandonados e testes de browser do fluxo completo. O plano permanece aberto nesses itens.
