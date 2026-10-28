# Execução de inspeções

Esta é a segunda parte da tarefa 9. Núcleo HTTP e interface de preenchimento estão disponíveis. O serviço de evidências segue pendente; não há upload, modo offline ou plano de ação nesta entrega.

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

## Interface de execução

As rotas `/inspections`, `/inspections/new` e `/inspections/:id` exigem sessão no servidor. O BFF encaminha JSON para inspeções sob as mesmas verificações de origem, tamanho e timeout das demais rotas. `GET /api/inspections` aceita page/pageSize/state e aplica escopo/autoria antes da contagem. A lista expõe metadados, sem respostas ou snapshots no DTO. `canEdit` e `canReopen` são calculados com o usuário atual na API e orientam os controles, sem substituir a autorização das mutações.

O salvamento reutiliza `features/shared/draft-session.ts`, extraído do construtor e tornado genérico. Campos tipados pertencem a `features/shared/question-field.tsx`, também consumido pela prévia. A execução mostra progresso das perguntas visíveis, aguarda a gravação mais recente antes da conclusão e preserva o conteúdo local quando há falha ou conflito. Conclusões permitem selecionar ciclos anteriores, inclusive durante o preenchimento de outro ciclo. Gestor não responsável consulta o rascunho, sem editor.

Ruling: situação de prazo e situação de execução da atribuição são distintas — concluir não deve apagar o histórico de ocorrências vencidas — custo: a lista apresenta ambas, com ações de iniciar/continuar/consultar. O servidor busca vínculos de inspeção em lote.

Ainda faltam para concluir a tarefa 9: observações por pergunta, evidências privadas no MinIO, promoção compensável, limpeza de uploads abandonados e testes de browser incluindo arquivos. O plano permanece aberto nesses itens.
