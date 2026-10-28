# Formulários, regras e versionamento

## Estado e responsabilidades

A tarefa 5 entrega a API e o motor de regras; a tarefa 7 integra o construtor visual em `/admin/forms`. A execução de inspeções pertence à tarefa 9. Os contratos em `packages/contracts/src/forms.ts` são compartilhados por essas etapas.

- `FormTemplateService`: catálogo, criação, rascunhos, pré-visualização e arquivamento.
- `FormVersionService`: publicação transacional, histórico e leitura de versões.
- `packages/form-engine`: avaliação pura e determinística compartilhada pela API e pela prévia, sem banco, Nest ou transporte HTTP. A fachada `rule-engine.service.ts` preserva a composição do módulo Nest.
- `packages/form-engine/src/definition-validation.ts`: validação de conteúdo, opções e dependências.
- `snapshot.ts`: hash estável, sem alterar a ordem de seções ou perguntas.

## Três números diferentes

| Campo           | Significado                                           |
| --------------- | ----------------------------------------------------- |
| `schemaVersion` | Formato do contrato do snapshot, atualmente 1         |
| `revision`      | Controle otimista das alterações no modelo/rascunho   |
| `number`        | Número sequencial da versão publicada, começando em 1 |

O nome do modelo é seu identificador administrativo legível. O `title` do snapshot é o título de cada versão e pode mudar em um novo rascunho sem alterar títulos históricos.

## Ciclo de vida

Criar um modelo produz estado DRAFT e um rascunho vazio. O rascunho pode ser salvo incompleto, desde que sua estrutura seja válida. Publicar exige conteúdo completo e regras válidas.

A publicação trava a linha do modelo, confere a revisão, valida a definição e insere uma versão nova na mesma transação da atualização do modelo e da auditoria. Depois disso o modelo fica PUBLISHED, aponta para a versão atual e não tem rascunho.

Para editar um publicado, criar um rascunho baseado em uma cópia da última versão. Enquanto esse rascunho existe, a versão publicada anterior continua disponível. O modelo permanece PUBLISHED e informa `hasDraft: true`.

Toda alteração exige a revisão esperada. Revisões antigas retornam 409; não há sobrescrita silenciosa. Duas publicações concorrentes da mesma revisão produzem um sucesso e um conflito, sem versões duplicadas. Em caso de conflito, o cliente deve recarregar o estado e preservar seu trabalho local para revisão, em vez de repetir automaticamente a gravação antiga.

Arquivar marca ARCHIVED e impede edições, novos rascunhos e publicação. Rascunhos existentes permanecem consultáveis pelo administrador, e versões publicadas continuam disponíveis para referências históricas. Não há exclusão física nem rota de restauração nesta etapa.

## Contratos HTTP

Todas as rotas exigem sessão válida e troca de senha concluída. POST e PUT usam JSON. O limite de corpo JSON da API é 2 MiB, incluindo os formulários maiores; limites estruturais também são aplicados.

| Método e rota                         | Permissão     | Entrada/resultado                                                 |
| ------------------------------------- | ------------- | ----------------------------------------------------------------- |
| `GET /api/forms`                      | Três perfis   | Lista paginada; `q`, `state`, `page`, `pageSize`                  |
| `GET /api/forms/:id`                  | Três perfis   | Metadados do modelo disponível                                    |
| `POST /api/forms`                     | Administrador | `{ name }`, cria modelo e rascunho vazio                          |
| `GET /api/forms/:id/draft`            | Administrador | `{ revision, snapshot }`                                          |
| `POST /api/forms/:id/draft`           | Administrador | `{ revision }`, copia a última versão para novo rascunho          |
| `PUT /api/forms/:id/draft`            | Administrador | `{ revision, snapshot }`, substitui o rascunho e avança a revisão |
| `POST /api/forms/:id/preview`         | Administrador | `{ revision, answers }`, retorna `{ revision, result }`           |
| `POST /api/forms/:id/publish`         | Administrador | `{ revision }`, retorna a versão criada                           |
| `POST /api/forms/:id/archive`         | Administrador | `{ revision }`, retorna os metadados arquivados                   |
| `GET /api/forms/:id/versions`         | Administrador | Histórico paginado, somente metadados                             |
| `GET /api/forms/:id/versions/:number` | Três perfis   | Snapshot e metadados da versão publicada específica               |

Administradores veem modelos em todos os estados. O catálogo de colaboradores e gestores inclui somente modelos PUBLISHED, com o filtro aplicado antes da paginação e da contagem. Rascunhos são administrativos. A leitura explícita de uma versão já publicada continua possível após arquivamento, para preservar referências históricas.

Nesta etapa os modelos são globais, sem dados de inspeções. A futura leitura e execução de inspeções deve verificar o escopo da inspeção com `AccessPolicy` e vincular a versão exata; a disponibilidade de um formulário não concede permissão sobre uma unidade ou setor.

## Estrutura do snapshot

O snapshot contém `schemaVersion`, `title` e `sections`. Cada seção contém `id`, `title` e `questions`. As posições nos arrays são a ordem oficial; não há um segundo campo de ordenação que possa contradizê-la.

Cada pergunta possui UUID estável, `label`, `type`, `required`, opções quando necessário, condições opcionais de visibilidade e uma regra opcional de não conformidade. Limites: 50 seções, 500 perguntas no total, 100 opções por seleção e 20 condições por pergunta. Títulos e labels não podem estar vazios na publicação. IDs de seção e de pergunta não podem se repetir; IDs de opções são únicos dentro da pergunta.

| Tipo      | Valor de resposta                                                   |
| --------- | ------------------------------------------------------------------- |
| TEXT      | String; conteúdo preservado, resposta só com espaços é vazia        |
| NUMBER    | Número JSON finito; zero é válido, string numérica não é convertida |
| DATE      | String YYYY-MM-DD representando uma data existente                  |
| SELECT    | UUID de uma opção da pergunta                                       |
| YES_NO_NA | YES, NO ou NA                                                       |

`AnswerInput` é `{ questionId, value }`, onde value pode ser string, número ou null. O motor informa REQUIRED para perguntas obrigatórias visíveis sem resposta. Opções desconhecidas, datas impossíveis e valores de tipo errado são rejeitados. Respostas duplicadas não são resolvidas escolhendo uma delas silenciosamente.

## Regras

Uma condição é `{ questionId, operator, value }`. Os operadores são EQ, NEQ e IN. EQ/NEQ usam um valor escalar compatível com a pergunta referenciada; IN usa uma lista não vazia desses valores. As condições de uma pergunta são combinadas por AND.

Referências só podem apontar para perguntas anteriores na ordem global de seções/perguntas. Referências inexistentes, posteriores, cíclicas ou com valor incompatível impedem a publicação. O servidor interpreta dados tipados; não executa código ou expressões fornecidas pelo cliente.

Uma condição só usa resposta válida de pergunta visível. Uma pergunta oculta não influencia perguntas posteriores nem gera não conformidades, mesmo se o cliente enviar uma resposta para ela. Ausência de resposta não satisfaz NEQ.

A regra de não conformidade usa o mesmo operador/valor, aplicada à própria pergunta, com `category` e `priority` (LOW, MEDIUM, HIGH, CRITICAL). Não há classificação implícita de NO ou NA: o administrador configura quais respostas geram ocorrência. A chave da ocorrência é o ID da pergunta; o domínio de inspeções deverá combiná-la com o ID da inspeção para idempotência.

`EvaluationResult` contém erros da definição, perguntas visíveis, erros de resposta, respostas aceitas e ocorrências determinísticas. Definição inválida não é avaliada parcialmente. A API de preview lê o rascunho do banco e recalcula tudo; não aceita resultados de avaliação enviados pelo cliente.

## Histórico e auditoria

Versões publicadas contêm número, snapshot, hash de conteúdo, autor e instante UTC. A migração protege a tabela contra UPDATE, DELETE e TRUNCATE. A edição acontece exclusivamente por novo rascunho e nova publicação.

O SHA-256 usa uma serialização com chaves de objeto ordenadas, para permanecer estável após o JSONB reorganizar as chaves. Arrays mantêm sua ordem, que faz parte do conteúdo. O histórico paginado não carrega nem repete todos os snapshots; a leitura individual retorna o conteúdo completo.

Criação, gravações de rascunho, criação de novo rascunho, publicação e arquivamento são auditados com requestId e identificadores. A auditoria de rascunho inclui revisão e hash, sem duplicar o documento inteiro em cada autosave.

## Verificação

Testes unitários cobrem tipos, obrigatoriedade, opções, datas, dependências, ciclos, visibilidade, não conformidades e hash. Testes HTTP usam PostgreSQL em banco temporário para verificar v1/v2 byte a byte, revisões antigas, autosave concorrente com publicação, duas publicações concorrentes, permissões, arquivamento, bloqueios de mutação direta e um formulário maior que o antigo limite JSON de 100 KiB.
