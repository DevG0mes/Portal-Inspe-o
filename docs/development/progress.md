# Progresso — plano: docs/superpowers/plans/2026-10-21-portal-inspecao-seguranca.md

## Estado atual

Tarefas 1 a 12 concluídas. Conta administrativa local de teste provisionada a pedido do usuário em 29/10/2026, com troca obrigatória de senha. Restam relatórios (13) e preparação operacional de produção (14).

## Tarefa 12 — painéis operacionais em 29/10/2026

- Módulo analytics, contratos e consultas parametrizadas para resumo, evolução diária, distribuição/detalhe de ocorrências e planos. Filtros de período, unidade, setor, formulário, categoria e prioridade; paginação de cada detalhe e seletor remoto de formulários autorizados, inclusive arquivados.
- Escopo e responsabilidade aplicados antes de contagens/agregações. Gestor vê setores vigentes; colaborador vê inspeções próprias/atribuídas e planos sob responsabilidade atual. Receber plano permite filtrar seu formulário, sem consultar a inspeção de origem. Administrador recebe contagens globais da estrutura separadas dos filtros operacionais.
- Ruling: última conclusão por inspeção selecionada antes do período evita duplicar ciclos; categoria/prioridade filtram perguntas avaliáveis e ocorrências. Sem denominador retorna null/“Sem base”. Literal NA de TEXT entra no denominador; apenas NA de YES_NO_NA é excluído. Média usa criação até aprovação de planos concluídos criados no período. Famílias e limites documentados em `analytics.md` e na própria tela.
- Janela padrão de 30 dias, máxima de 366. Limites inclusivos por dia em America/Sao_Paulo calculados pelo PostgreSQL; sem offset fixo. Histórico de formulários arquivados preservado; estrutura inativa não é recorte operacional.
- Painéis por perfil com atalhos de trabalho, cartões reais, evolução em tabela/meter nativo, distribuições por cinco dimensões (top dez explícito), detalhes paginados e links autorizados. Filtros e páginas na URL; mudança de unidade limpa setor; leituras anteriores canceladas; erro exige atualização explícita. Reutiliza campos, seletor, avisos, tabelas móveis e paginação existentes.
- RED→GREEN da API: endpoints ausentes; distribuições ausentes; NA literal contado incorretamente; formulário de plano atribuído omitido no seletor. Fixtures cobrem bordas de São Paulo, reabertura, arquivamento, ausência de base, escopo, filtros inválidos e tempo médio.
- Volume: 4.500 inspeções adicionais em dois escopos; EXPLAIN ANALYZE/BUFFERS confirma índices existentes, execução inferior a cinco segundos no teste e ausência de contagens cruzadas. Sem migração nova ou dependência de gráficos.
- Ruling: limite de quatro suítes HTTP simultâneas — duas execuções com paralelismo irrestrito passaram nas asserções, mas excederam 10 s na limpeza de bancos descartáveis; quatro suítes passaram integralmente — reduz concorrência de DDL/checkpoints locais sem aumentar timeouts ou retirar testes. Custo: execução mais limitada em máquinas muito maiores.
- Revisão independente encontrou numerador de conformidade incluindo ocorrências NA excluídas do denominador. Reproduzido com RuleEngine real e regra NEQ YES (NO + NA geravam −100%). Corrigido com EXISTS sobre as mesmas respostas avaliáveis; campo `nonconformingAnswers` separado do total operacional. Regressão passou de −100% para 0%, mantendo duas ocorrências e uma resposta avaliável com falha. Revisão posterior sem bloqueadores.

### Evidências da tarefa 12

- `pnpm test`: 70 aprovados; `pnpm test:e2e`: 94 aprovados; `pnpm test:integration`: 10 aprovados. Inclui sete testes novos de métricas e volume representativo com EXPLAIN ANALYZE/BUFFERS.
- `pnpm test:browser`: 38 cenários aprovados, 19 desktop e 19 celular. Total: 212 testes/cenários distintos. Painel usa dados reais de conclusão, filtra categoria, abre inspeção autorizada, recupera falha de consulta, exibe ausência de base e diferencia administrador/gestor.
- Lint, tipos, formatação, build e auditoria premium estrita aprovados. Axe WCAG A/AA sem violações nas telas exercitadas; sem overflow horizontal móvel. Capturas de computador e celular examinadas visualmente.
- Sem migração nova. API/web/worker reiniciados com a versão compilada. Health ready confirmou PostgreSQL/Redis/MinIO up; API de métricas sem sessão retorna 401 e dashboard protegido redireciona a `/login`.
- Limites: leituras atuais por recorte, sem snapshot único entre endpoints; distribuições limitadas aos dez maiores grupos, detalhe completo paginado. Última conclusão substitui ciclos anteriores nos indicadores; histórico permanece na inspeção. Homologação física e capacidade de produção continuam posteriores.

## Tarefa 11 — notificações internas em 29/10/2026

- Migração 202610290002, entidade, contratos e API de lista paginada, contagem de não lidas e leitura individual/em lote. Destinatário aplicado antes de paginação/contagem; leitura de outra pessoa retorna 404.
- Emissão usa EntityManager da transação de negócio, constraint única por evento/destinatário e ON CONFLICT sem alterar readAt. Criação/reatribuição de plano e materialização de inspeção avisam responsáveis; solicitação de validação avisa gestores elegíveis e administradores; aprovação/devolução avisam responsável. Comentários não geram avisos.
- Ruling: helper transacional `emitOnce` é função interna compartilhada, sem endpoint de emissão — evita dependência circular entre módulos e impede gravação fora da transação — custo: chamadores precisam fornecer o EM transacional, documentado e verificado por rollback real.
- Job `notify-deadlines` na fila existente, a cada 15 minutos. Proximidade até 24h, vencimento separado, 100 destinatários por tipo/lote, anti-join persistente evita starvation. Chaves usam instante epoch, sem depender de timezone da conexão. Conclusões/cancelamentos/usuários e escopos inativos são excluídos. Repetição não duplica. Decisões detalhadas em `notifications.md`.
- Avisos guardam somente tipo e referência. Título e link são projetados após autorização atual; revogação/reatribuição não revela o conteúdo antigo. Planos abrem detalhe; atribuições abrem lista autorizada. Histórico de avisos permanece com registro indisponível quando necessário.
- Central em `/notifications`, filtro não lidas na URL, paginação, atualização explícita, erros com retry e marcação idempotente. Indicador no menu atualiza ao mudar rota, voltar à aba, marcar leitura e a cada minuto visível; requisições antigas são canceladas. Usa componentes e estilos existentes, sem dependência nova e sem e-mail/push externo.
- RED→GREEN: emissão e central ausentes; duplicação concorrente/rollback/leitura; eventos do fluxo e prazos; título autorizado/null sem acesso. Browser verifica falhas de consulta/escrita com retry, leitura individual/em lote, filtro vazio e acessibilidade. README, DESIGN e UX-CONTRACT atualizados.
- Revisão independente sem bloqueadores P1/P2. Observação menor registrada: contador operacional de tentativas do job pode superar inserções em corrida de workers; unicidade/leitura permanecem corretas e esse contador não governa processamento ou métricas do portal.

### Evidências da tarefa 11

- `pnpm test`: 70 aprovados; `pnpm test:e2e`: 87 aprovados; `pnpm test:integration`: 10 aprovados, incluindo schema e ciclo de migrações. Rodadas focadas posteriores de notificações/planos/programações também aprovadas.
- `pnpm test:browser`: 36 cenários aprovados, 18 desktop e 18 celular. Total: 203 testes/cenários distintos. Fluxo de correção inclui central e leitura; novo cenário testa falhas, retry e leitura em lote com filtro vazio.
- Lint, tipos, formatação, build e auditoria premium estrita aprovados. Axe WCAG A/AA sem violações nas telas exercitadas; sem overflow horizontal móvel. Captura da central móvel com títulos e paginação examinada.
- Migração 202610290002 aplicada ao banco local e API/web/worker reiniciados. Health ready: PostgreSQL/Redis/MinIO up. API sem sessão retorna 401; página protegida redireciona a `/login`. Redis confirmou os schedulers de materialização, limpeza e notificações. Job real `notify-deadlines` processado pelo worker com sucesso, sem avisos elegíveis no banco local.
- Limites: avisos exclusivamente internos, polling sem push; até 100 destinatários por tipo a cada 15 minutos para prazos. Homologação em aparelho físico e preparação de produção permanecem posteriores. Não houve publicação externa.

## Tarefa 10 — planos de ação em 29/10/2026

- Ocorrências pendentes paginadas por escopo; criação de plano vinculada a uma pergunta de uma conclusão imutável. Constraint única e retry idempotente evitam planos duplicados para a mesma ocorrência. Ciclos posteriores têm ocorrências próprias.
- Máquina pura OPEN/IN_PROGRESS/AWAITING_VALIDATION/COMPLETED. Início e solicitação exigem responsabilidade atual; atribuição e decisão exigem gestor/administrador no setor. Solicitação requer justificativa e evidência finalizada; devolução requer motivo. Vencimento é derivado da data inclusiva em São Paulo, sem substituir o estado.
- Migração 202610290001, contratos e módulo próprios; histórico append-only e auditoria na mesma transação do comando. Atribuição/criação congelam responsável, prazo, prioridade e descrição; solicitações congelam evidências. Revisão otimista e commandId protegem concorrência e retries.
- Evidências corretivas reutilizam arquivos privados, validação de conteúdo, retenção e limpeza. Responsável recebe somente a pergunta de origem e seus arquivos no snapshot; não ganha acesso às outras perguntas ou ao restante da inspeção. Revogar vínculo impede o download e a consulta.
- Telas de lista, criação pela ocorrência e detalhe com comentários, evidências, atribuição, validação e histórico paginado. Campos, seleção remota, diálogos, proteção de saída e recuperação de conflitos são compartilhados. Formatador de respostas em leitura extraído para `features/shared/answer-display.ts`.
- Revisão independente encontrou perda de edição independente após salvar comentário/atribuição e ausência dos metadados anteriores no histórico. Reproduzidos e corrigidos; testes preservam comentário não enviado e atribuição ainda local. Revisão posterior sem bloqueadores. Browser reproduziu perda de foco ao fechar confirmação por conflito; fechamento e foco passaram a ocorrer em etapas distintas.
- Regras operacionais e decisões de escopo documentadas em `action-plans.md`; DESIGN e UX-CONTRACT atualizados. Nenhuma dependência nova. Não houve publicação externa.

### Evidências da tarefa 10

- `pnpm test`: 70 aprovados; `pnpm test:e2e`: 84 aprovados; `pnpm test:integration`: 10 aprovados, incluindo schema e ciclo das migrações em banco temporário.
- `pnpm test:browser`: 34 cenários aprovados, 17 desktop e 17 celular. Total: 198 testes/cenários distintos. Fluxo de correção com arquivo real e conflito em duas abas passaram de falha para sucesso; regressão completa inclui administração, construtor, programação e inspeção.
- Lint, tipos, formatação, build e auditoria premium estrita aprovados. Axe WCAG A/AA sem violações nas telas exercitadas; sem overflow horizontal na viewport móvel. Captura móvel do detalhe examinada visualmente.
- Migração 202610290001 aplicada ao banco local; API/web/worker reiniciados. Health ready confirmou PostgreSQL/Redis/MinIO up; API de planos sem sessão retornou 401 e página protegida redirecionou a `/login`.
- Limites: acesso local, sem notificações automáticas nesta etapa. Testes móveis usam Edge com viewport/touch; homologação física e controles de produção permanecem nas etapas posteriores.

## Tarefa 9 — evidências e observações em 28–29/10/2026

- Criado módulo `files`, contratos públicos de arquivo/política/recibo e adapter MinIO. Migração 202610280004 adiciona notas por pergunta, metadados de evidências em cada conclusão e registros duráveis de preparo. Rascunhos e ciclos anteriores preservados.
- Observações opcionais de até 2.000 caracteres compartilham autosave/revisão das respostas. Conclusão recalcula visibilidade no servidor e congela somente notas e evidências READY de perguntas visíveis.
- Preparo idempotente por ID de envio; chaves internas independentes geradas no servidor. Binário atravessa BFF com origem e rota estritas, sem multipart, limitado a 25 MiB absolutos. Política efetiva: padrão 10 MiB por arquivo configurável, 5 vínculos por pergunta e 20 ativos por inspeção. Extensão/MIME/assinatura/tamanho/SHA-256 verificados.
- Ruling: promoção faz I/O sob lock da inspeção e artefato — evita vínculo tardio após conclusão e corridas de compensação — custo: mutações da mesma inspeção aguardam armazenamento. Requests têm cancelamento real de 15 s; retries prolongados do SDK são impedidos nesse trecho. Ambas as chaves são persistidas antes do upload, permitindo recuperar queda do processo ou falha do commit. Compensação acontece antes de liberar o lock.
- READY tem retenção indefinida; desvincular no ciclo reaberto não altera o histórico. Cleanup BullMQ a cada 15 minutos remove somente preparos expirados e sobras temporárias de READY, com retries e lote de 100. Nunca remove o destino de uma evidência READY.
- Downloads exigem autorização atual e retornam URL assinada de 60 s, sem URL persistida no histórico. Bucket sem política pública; política anônima preexistente é rejeitada no preparo. O controle do TTL de um link já emitido é documentado em `evidence.md`.
- Interface oferece observação, seleção, transferência com progresso, retry sem duplicar, cópia local da seleção e cancelamento/desvinculação confirmado. Última geração é salva antes do arquivo; `acceptRevision` não reconhece evidência sobre respostas locais pendentes. Confirmação fica fora do fieldset bloqueado. Download é preparado e aberto explicitamente.
- Testes iniciais falharam por módulo/rota ausentes e notas rejeitadas. Testes adicionais reproduzem conteúdo forjado, MIME herdado do protótipo, promoção parcialmente bem-sucedida, limpeza com falha, concorrência concluir/finalizar e escopo/proprietário. Revisão independente sem P1/P2.
- Integração real MinIO verifica bloqueio anônimo e downloads assinados. Browser usa bucket aleatório exclusivo; helper de limpeza recusa buckets não pertencentes ao teste ou endpoints não locais. Banco/fila continuam isolados.
- Build teve bloqueio EPERM no cache gerado do Next dentro do OneDrive; removido apenas `.next` após validar o caminho absoluto dentro do workspace. Compilação posterior aprovada. A execução foi interrompida pelo limite da revisão automática de permissões em 28/10 e retomada em 29/10, sem contorno da aprovação.
- Ambiente reativado em 29/10 com volumes existentes. Bootstrap local criou a conta solicitada sem alterar contas anteriores; senha aleatória somente na conversa. Login/sessão retornaram 200, papel ADMIN e redirecionamento para troca obrigatória; sessão técnica de conferência encerrada. Nenhuma senha foi adicionada aos arquivos.

### Evidências finais da tarefa 9 em 29/10/2026

- `pnpm test`: 66 testes aprovados. `pnpm test:e2e`: 80 aprovados. `pnpm test:integration`: 10 aprovados. `pnpm test:browser`: 30 cenários aprovados, 15 desktop e 15 celular. Total: 186 testes/cenários distintos. Rodadas focadas anteriores não são contadas novamente.
- Lint, tipos, formatação e build aprovados. Auditoria premium estrita sem apontamentos. Axe WCAG A/AA sem violações nas telas exercitadas; viewport móvel sem overflow horizontal. Captura móvel do envio finalizado examinada.
- Migração 202610280004 aplicada ao banco local. API e frontend compilados em execução; readiness confirmou PostgreSQL/Redis/MinIO up. Redis confirmou um worker e schedulers `scan-schedules`/`cleanup-uploads` registrados.
- Login da conta local solicitada validado pelo BFF; senha temporária exige troca antes de abrir o portal. Credenciais não fazem parte do commit. Testes automáticos mantêm contas, bancos, filas e buckets próprios.
- Limites: ambiente local de desenvolvimento. Não houve publicação, envio de mensagens ou implantação de produção. Homologação em celular físico e controles operacionais de produção pertencem às etapas posteriores. Planos de ação ainda pertencem à tarefa 10.

## Tarefa 9 — interface de execução em 28/10/2026

Este incremento anterior foi seguido pela implementação de evidências e observações descrita em `evidence.md`; a verificação final foi retomada em 29/10 após interrupção por limite da revisão automática de execução.

- Rotas protegidas `/inspections`, `/inspections/new` e `/inspections/:id`; navegação comum, lista paginada, filtros por situação, criação com seletores remotos e confirmação. API aplica escopo/autoria antes da contagem e retorna metadados sem respostas no DTO de lista.
- Campos dos cinco tipos, condições de visibilidade, progresso das perguntas respondidas, autosave, validação com foco no primeiro erro, confirmação final e consulta das respostas/ocorrências de cada ciclo. Gestor não responsável recebe consulta do rascunho, sem edição.
- Ruling: autosave foi extraído do construtor para `features/shared/draft-session.ts` e tornado genérico; uma fachada mantém importações existentes — evita dois algoritmos de concorrência — custo: regressões devem cobrir também o construtor. Renderizador de campos tipados extraído para `features/shared/question-field.tsx` e reutilizado pela prévia.
- Erros de salvamento exigem retry; conflito real 409 interrompe escrita e mantém JSON local para copiar. Recarregar pede descarte explícito. DirtyGuard/beforeunload protegem alterações; sem cache offline. Hook de leitura passou a considerar revisão também na seleção do estado, evitando montar um editor novo com dados anteriores durante reload.
- Atribuições retornam inspeção vinculada, estado e permissão de início. Busca de vínculos em lote; UI permite iniciar/continuar/consultar, preservando separadamente a situação de prazo. Criar avulsa substitui histórico; iniciar atribuição usa navegação de documento para beforeunload.
- Revisão independente apontou ausência do histórico para responsável após reabertura. Teste de componente e browser reproduziram; corrigido com consulta somente leitura, sem desmontar o rascunho ou oferecer ações de descarte. Segunda revisão sem bloqueadores.
- Teste de precisão reproduziu arredondamento indevido de medidas na consulta; formatação pt-BR passou a preservar até 21 algarismos significativos, sem mudar o número armazenado.
- Sem migração nova neste incremento. Contratos visuais e documentação de execução atualizados; uploads, observações e limpeza continuam pendentes na tarefa 9.

### Evidências da interface de execução

- Autosave genérico e contratos novos passaram de módulo ausente/404/campos ausentes para sucesso. Histórico durante reabertura e precisão numérica tiveram regressões reproduzidas antes da correção.
- `pnpm test`: 61 testes aprovados. `pnpm test:e2e`: 73 aprovados. `pnpm test:integration`: 9 aprovados. `pnpm test:browser`: 28 cenários aprovados, 14 desktop e 14 celular. Rodada focada final de precisão: 2 cenários aprovados, sem contagem duplicada. Total: 171 testes/cenários distintos.
- Lint, tipos, formatação, build e auditoria premium estrita aprovados. Axe WCAG A/AA sem violações nas telas exercitadas; viewport móvel sem overflow horizontal. Capturas de preenchimento desktop e celular examinadas visualmente.
- API e web compilados reiniciados no ambiente local. Readiness confirmou PostgreSQL/Redis/MinIO up; `/inspections` sem sessão retornou 307 para `/login`. Testes de browser continuam usando banco e fila aleatórios exclusivos, sem criar contas reais no portal.
- Limites: a tarefa 9 ainda não está concluída porque evidências/observações/limpeza de temporários permanecem pendentes. Homologação física em celular e implantação de produção continuam posteriores; testes móveis usam viewport/touch do Edge.

## Tarefa 9 — núcleo de execução em 28/10/2026

- Criados contratos, DTOs estritos, módulo HTTP e entidades Inspection/InspectionSubmission. Migração 202610280003 adiciona chaves, índices e triggers que impedem UPDATE/DELETE/TRUNCATE das conclusões.
- Ruling: a tarefa 9 é entregue em incrementos verificáveis; este incremento cobre o núcleo de execução. Interface, observações e infraestrutura de evidências permanecem explicitamente pendentes — evita misturar uma alteração transacional com transporte binário e UX de uploads — custo: a execução ainda não está disponível pela interface nesta entrega.
- Ruling: responsáveis compartilham uma inspeção por atribuição, iniciada somente a partir do horário da ocorrência; atraso não bloqueia execução. Cancelamento impede nova inspeção. Criador ou responsável pode editar; gestores/administradores podem consultar e reabrir dentro do escopo, sem assumir automaticamente a autoria das respostas.
- Avulsa fixa a versão publicada sob lock do modelo; atribuída usa a versão já materializada. Nova publicação não altera inspeções existentes.
- Salvamento de rascunho aceita conteúdo incompleto, exige IDs únicos/conhecidos e revisão otimista. Conclusão recalcula regras no servidor, valida respostas visíveis e grava apenas respostas aceitas; estado, revisão, conclusão, ocorrências e auditoria são confirmados na mesma transação.
- Ruling: ocorrências são congeladas na conclusão e identificadas por `(submissionId, questionId)`; a etapa de planos de ação deverá referenciá-las, sem recalcular o histórico — custo: não há recurso de tratamento de ocorrência neste incremento.
- Repetir conclusão com revisão de origem e ciclo iguais retorna o mesmo resultado. Reabertura exige papel atual de gestor/administrador, revisão e motivo; incrementa ciclo e preserva conclusões anteriores. Solicitação antiga não pode concluir um novo ciclo.
- Revisão independente encontrou corrida de autorização durante espera por locks. Teste real com desativação concorrente da unidade reproduziu 201 indevido; passou a 403 após locks compartilhados usuário→unidade→setor, refresh e revalidação. Inspeção/atribuição usam locks exclusivos; segunda revisão sem bloqueadores.
- Documentação dos contratos, permissões, histórico e itens pendentes em `docs/development/inspections.md`. Tarefa 9 ainda não marcada como concluída no plano.

### Evidências deste incremento da tarefa 9

- Testes HTTP iniciais falharam com 404 antes da implementação; os dez cenários novos passaram após implementação e correção de concorrência.
- `pnpm test`: 56 aprovados. `pnpm test:e2e`: 72 aprovados. `pnpm test:integration`: 9 aprovados, incluindo drift vazio e ciclo completo down/up em banco temporário.
- Browser: 21 dos 22 cenários passaram na rodada completa. O primeiro cenário desktop atingiu o limite total de 60 s depois de consumir cerca de 57 s na navegação inicial, conforme trace. Repetição isolada passou em 10,6 s; os 22 cenários distintos ficaram verificados. Sem alteração nos timeouts ou no código de autenticação.
- Total: 159 testes/cenários distintos aprovados, considerando a repetição isolada. Lint, tipos, formatação e build aprovados. Segunda revisão independente sem bloqueadores.
- Migração 202610280003 aplicada ao banco local. API compilada reiniciada; readiness retornou PostgreSQL/Redis/MinIO up e a nova rota respondeu 401 sem sessão. Nenhuma conta real, senha padrão ou envio externo foi criado.

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

## Tarefa 6 — interface e administração em 28/10/2026

- Login, erro genérico, troca de senha obrigatória/opcional, logout e encerramento de sessões integrados à API. Proteção SSR e navegação por perfil; sem segredo de sessão em Web Storage.
- Shell responsivo, dashboard com contagens reais e administração de usuários, unidades, setores e vínculos múltiplos. Listas/filtros/paginação consultam a API; escolhas remotas também são paginadas. Desativação, permissões e vínculos têm confirmação; histórico preservado.
- Ruling: `features/admin` centraliza o CRUD semelhante de usuários/unidades/setores em lugar de duplicar pastas por recurso; vínculos têm componente próprio. `features/shared` contém comportamentos recorrentes e `packages/ui` mantém elementos visuais/tokens. Custo: uma alteração comum exige verificar os três recursos.
- Ruling: BFF Next com upstream privado e cookie HttpOnly em Path=/ na origem web permite SSR. API mantém Path=/api; emissão pelo BFF limpa a variante antiga. JSON, origem, tamanho, timeout e segmentos validados. Testes de duplicidade e fronteira impedem ampliação acidental.
- Ruling: entradas de formulário pela lista usam navegação por documento para proteger o Voltar com beforeunload. Links internos usam confirmação do aplicativo. Busca de pessoas fica em memória por privacidade; página/situação/perfil retornam por whitelist na URL. Custo: busca é limpa ao abrir outro documento.
- Contratos de setores/vínculos agora incluem nomes das unidades/setores, populados pelo ORM, para evitar consultas individuais por linha. Sem migração de schema.
- `DESIGN.md`, `UX-CONTRACT.md`, manifesto premium e guia `web.md` documentam identidade, comportamento e responsabilidades.
- Testes de login e mapeadores falharam antes da implementação. Revisão independente identificou submit acidental ao paginar, reenvio de perfil antigo, saída ausente da troca obrigatória e perda ao Voltar. Corrigidos; paginação e PATCH têm testes reproduzindo RED→GREEN. Revisão posterior não encontrou novos bloqueadores.
- Browser detectou corrida entre busca e substituição de rota ao abrir um vínculo. Busca na primeira página não substitui a rota; entradas por documento também evitam a corrida. Uma falha da automação aguardava load após cancelar beforeunload; o teste passou a acionar history.back e verificar o diálogo e o conteúdo preservado, sem aguardar navegação que foi cancelada.
- Browser móvel expôs interação antes de hidratar a página. Formulários agora desabilitam campos no SSR até os handlers estarem prontos, e declaram method=post para nunca ter fallback GET de credenciais. Teste SSR RED→GREEN e revisão independente confirmaram a correção.

### Evidências da tarefa 6

- `pnpm test`: 34 testes aprovados; `pnpm test:e2e`: 55 aprovados; `pnpm test:integration`: 8 aprovados.
- `pnpm test:browser`: 10 cenários aprovados (5 desktop, 5 celular), incluindo autenticação, troca obrigatória, restrição por perfil, CRUD, duas unidades/dois setores, paginação, vazio, falha/retry, Escape/foco, descarte/Voltar e fronteira BFF. Axe WCAG A/AA sem violações nas telas exercitadas; largura sem overflow horizontal. Total: 107 testes/cenários.
- Lint, tipos, formatação, build e auditoria premium estrita aprovados. Capturas desktop/móvel examinadas visualmente. Revisão final sem bloqueadores.
- API local reiniciada com build atual: PostgreSQL/Redis/MinIO up. Interface local respondeu 200 em `/login` na porta 3000. Nenhuma conta real ou senha padrão criada; bootstrap administrativo permanece explícito no guia de autenticação.
- Limite: navegador automatizado usa Edge desktop com viewport/touch móvel; validação em aparelho físico e implantação de produção pertencem à homologação. Edição explícita concorrente do mesmo campo cadastral segue última gravação da API.

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

## Tarefa 3 — identidade, autenticação e sessões

- Criados usuários e sessões, contratos compartilhados, DTOs estritos, serviço Argon2id e guard global. Apenas saúde e login são públicos.
- Login retorna principal seguro e cookie opaco HttpOnly/SameSite=Strict. Banco mantém apenas SHA-256 do identificador da sessão. Cookie Secure em produção, com origem HTTPS validada na configuração.
- Implementados login, me, logout, logout geral e troca de senha. Contas com troca obrigatória só podem consultar o principal, trocar a senha ou sair. Sessões de usuários inativos ou vencidas são rejeitadas.
- Falhas de login são serializadas por bloqueio de linha no PostgreSQL e auditadas na mesma transação. Uma falha é lançada somente depois de confirmar a transação, preservando contadores e histórico.
- Login com cookie anterior rotaciona a sessão; troca de senha revoga todas as sessões antigas e cria outra. Reset administrativo revoga sessões e exige troca posterior; sem endpoint público de reset nesta etapa.
- Incluído bootstrap local único de administrador, protegido por advisory lock e permitido apenas com tabela de usuários vazia. Não foi criado administrador real nem definida senha padrão.
- Ruling: limites iniciais de 5 falhas/15 minutos, sessão absoluta de 8 horas e novas senhas de 15–128 caracteres; centralizados e documentados para revisão corporativa na implantação. Argon2id usa memória de 19 MiB, 2 iterações e paralelismo 1.
- Ruling: `/auth/logout-all` acrescentado para atender ao encerramento remoto das sessões do próprio usuário previsto na especificação. Requer troca de senha concluída.
- Ruling: JSON obrigatório e verificação de Origin/Fetch Metadata nas alterações reforçam a proteção de cookies e do login. APP_ORIGIN define a origem permitida; clientes operacionais sem Origin permanecem possíveis.
- Ruling: BaseEntity.id recebeu tipo explícito string para representar o contrato público sem depender da inferência restrita de UUID do Node.js. Validação de identificadores externos permanece nos DTOs.
- Extraído helper compartilhado de bancos temporários locais, usado pela autenticação, bootstrap e suíte de persistência. Testes de migração fazem down/up da cadeia completa apenas no banco temporário.
- A verificação de drift detectou default de perfil e regra de atualização da FK divergentes; a migração 002 foi corrigida antes de aplicação no banco do portal. O schema final corresponde às entidades.
- Revisão independente: nenhum ajuste obrigatório. Documentação operacional em `docs/development/authentication.md`.

### Evidências da tarefa 3 em 27/10/2026

- Testes novos de senha, DTOs, HTTP e bootstrap falharam inicialmente pela ausência dos módulos, antes da implementação.
- `pnpm test`: 13 testes aprovados.
- `pnpm test:e2e`: 21 testes aprovados, incluindo autenticação real, concorrência de login, cookies, CSRF, reset e bootstrap simultâneo.
- `pnpm test:integration`: 8 testes aprovados, incluindo alinhamento de schema e ciclo integral de migrações.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm build`: aprovados.
- `pnpm --filter @portal/api db:migrate`: migração 002 aplicada ao banco local.
- API compilada reiniciada; health ready retornou os três serviços up. `/api/auth/me` sem cookie retornou 401 e Cache-Control no-store.

## Tarefa 4 — organização, usuários e autorização por escopo

- Criados módulos `access` e `organization`, administração em `identity`, contratos públicos e migração 003. Estrutura, vínculos e política de autorização têm serviços separados.
- AccessPolicy consulta perfil/estado atuais; filtros de escopo entram na consulta antes de contar e paginar. Unidade permitida sem setor explicitamente autorizado retorna 403. Administrador tem acesso global auditado; combinações operacionais ainda precisam ser válidas e ativas.
- Ruling: vínculos separados em UnitMembership e SectorMembership. O setor depende de vínculo explícito de unidade; um grant de unidade não libera todos os setores. A migração valida compatibilidade e impede reapontar relacionamentos existentes.
- CRUD paginado de usuários, unidades, setores e vínculos; exclusões são desativações lógicas. Nomes normalizados têm unicidade por unidade para setores. DTOs estritos e resumos explícitos não expõem credenciais.
- Desativação, alteração de perfil ou e-mail revogam sessões. Reset administrativo integrado ao endpoint protegido, com troca obrigatória posterior. Não foi criado cadastro público nem um usuário real.
- Ruling: revogar o vínculo de unidade desativa seus grants de setor; reativar apenas esse vínculo não restaura automaticamente os setores revogados. Identificadores, datas de criação e eventos de auditoria são preservados.
- Ruling: impedir remoção do último administrador ativo, inclusive sob concorrência, para preservar acesso administrativo ao sistema.
- Testes concorrentes descobriram que locks adquiridos por `em.getConnection().execute` não estavam vinculados à transação. Corrigidos UsersService e o bootstrap anterior para usar `em.execute`. Um teste com latência controlada reproduziu a criação duplicada no bootstrap antigo e comprovou a correção.
- Revisão independente encontrou atualização perdida de vínculos lidos antes do lock. Dois testes HTTP determinísticos reproduziram resposta true com estado false no banco. Corrigido com refresh do próprio vínculo após os locks; refresh do pai mantido. Revisão posterior confirmou o ajuste sem achados pendentes.
- A migração 003 e o schema das entidades passaram na suíte de drift e no ciclo integral de down/up em banco temporário.

### Evidências da tarefa 4 em 27/10/2026

- Testes novos de DTO e matriz de acesso falharam antes da implementação.
- `pnpm test`: 16 testes aprovados.
- `pnpm test:e2e`: 42 testes aprovados, incluindo 21 de escopo/usuários, concorrência e revogação.
- `pnpm test:integration`: 8 testes aprovados.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm build`: aprovados.
- Total: 66 testes. Migração 003 aplicada ao banco local. API compilada reiniciada; health ready retornou PostgreSQL, Redis e MinIO up. As rotas de usuários, unidades e setores retornaram 401 sem sessão.

## Tarefa 5 — formulários, regras e versionamento em 28/10/2026

- Criados contratos compartilhados, entidades FormTemplate/FormVersion, migração 202610280001 e módulo forms com serviços separados de ciclo do modelo, versões e motor puro.
- Snapshots têm seções e perguntas ordenadas em arrays, IDs estáveis, TEXT/NUMBER/DATE/SELECT/YES_NO_NA, obrigatoriedade, opções, condições e não conformidades configuráveis.
- Motor determinístico valida datas, números, seleção, referências anteriores, referências removidas, ciclos e tipos de predicado. Respostas ocultas não influenciam visibilidade posterior nem ocorrências; resultados enviados pelo cliente não são aceitos.
- Ruling: rascunhos incompletos podem ser salvos sob validação estrutural. Publicação exige validação semântica completa. Isso permite autosave no futuro construtor sem publicar conteúdo inválido.
- Ruling: condições combinadas por AND e operadores EQ/NEQ/IN, com referências somente a perguntas anteriores. SELECT é seleção simples por ID; NO/NA geram ocorrências somente se configurados.
- Revisão otimista compartilhada pelas gravações/publicações/arquivamentos e lock de linha obtido antes de ler o estado mutável. Duas publicações ou autosave/publicação da mesma revisão produzem um sucesso e um 409.
- Publicação cria snapshot imutável, número sequencial, hash estável, autor e instante. Novo rascunho é cópia da última versão. Triggers rejeitam UPDATE/DELETE/TRUNCATE de versões publicadas.
- Ruling: modelos publicados permanecem PUBLISHED durante a edição de novo rascunho; hasDraft indica o trabalho pendente. Arquivamento preserva versões e bloqueia novas alterações. Versões históricas permanecem legíveis aos perfis autenticados; modelos não contêm dados de inspeção e são globais nesta etapa.
- Histórico administrativo paginado usa somente metadados e projeção SQL sem snapshots. Conteúdo completo é obtido por versão específica. Hash ordena chaves de objeto e preserva ordem de arrays.
- Limite JSON ajustado a 2 MiB; teste real de 500 perguntas comprova aceitação além do limite padrão anterior de 100 KiB.
- Revisão independente não encontrou bloqueadores. Um caso Unicode reproduziu expansão da chave lowercase de um nome válido; name_key de formulários passou a text, preservando o limite do nome exibido. Teste passou de 500 para 201. Entidades e migração foram ajustadas antes da aplicação local.
- Uma revisão automática de permissão expirou antes de executar a validação. A repetição autorizada funcionou; não houve contorno de sandbox ou ação rejeitada por risco.

### Evidências da tarefa 5

- Testes novos de motor e versões falharam inicialmente pela ausência dos módulos antes da implementação.
- `pnpm test`: 27 testes aprovados.
- `pnpm test:e2e`: 55 testes aprovados, incluindo 13 do ciclo de formulários.
- `pnpm test:integration`: 8 testes aprovados, incluindo drift de schema e ciclo completo de migrações em banco temporário.
- Total: 90 testes. Lint, tipos, formatação e build aprovados. Migração 202610280001 aplicada ao banco local. API compilada reiniciada; health ready retornou os três serviços up e o catálogo de formulários retornou 401 sem sessão. Revisão posterior confirmou os ajustes de Unicode e projeção de histórico sem achados pendentes.

## Tarefa 7 — construtor visual em 28/10/2026

- Catálogo administrativo em `/admin/forms`, criação e filtros paginados. Editor de seções, perguntas, opções, condições EQ/NEQ/IN e regras de ocorrência, com IDs estáveis. Ordenação por botões, sem exigir drag. Remoções e mudanças destrutivas têm confirmação; dependências inválidas impedem reordenação/remoção.
- Autosave serializado de 700 ms, suspenso durante IME, com geração local e revisão do servidor. Respostas antigas não substituem digitação nova. Falha exige retry explícito; 409 interrompe gravações e preserva JSON local para copiar antes de recarregar com confirmação. DirtyGuard comum protege alterações pendentes.
- Ruling: extraído o motor puro existente para `packages/form-engine`, consumido pela API e pela prévia. Evita validação divergente no cliente. A fachada de RuleEngine mantém a composição Nest; API segue autoridade de publicação/avaliação. Sem dependência do browser em Nest ou persistência.
- Prévia imediata com motor compartilhado e conferência explícita da revisão salva na API. Respostas simuladas não criam inspeção nem persistem no banco. Tipos TEXT/NUMBER/DATE/SELECT/YES_NO_NA mantêm valores tipados. DATE usa controle nativo conforme contrato atualizado.
- Publicação confirma snapshot imutável; novo rascunho não muda a versão corrente. Histórico paginado com autor legível e data/hora em America/Sao_Paulo. Consulta/simulação de v1/v2 e arquivamento preservam conteúdo. DTO inclui publishedByName com projeção apenas de id/nome do autor; sem migração de schema.
- Ruling: o nome administrativo permanece definido na criação, seguindo a API; o título do snapshot é editável por versão. Não foi inventado endpoint de renomeação.
- Testes do modelo/autosave falharam pela ausência dos módulos, depois passaram. Erros estruturados por campo e nome do autor também tiveram RED→GREEN.
- Revisão independente encontrou sentinel vazio em IN, colisão de IDs de opções ao duplicar referências externas, mudança destrutiva sem confirmação e modal bloqueado ao surgir 409. Todos reproduzidos em testes; corrigidos. O último foi reproduzido com 409 real em duas abas, desktop/celular, e corrigido desmontando confirmações locais ao entrar em conflito e focando a recuperação. Revisão posterior sem bloqueadores.
- Documentação: `form-builder.md`, `forms.md`, `DESIGN.md`, `UX-CONTRACT.md` e manifesto premium atualizados. Seleção/diálogos/avisos/campos seguem os proprietários existentes.

### Evidências da tarefa 7

- `pnpm test`: 47 testes aprovados. `pnpm test:e2e`: 55 aprovados. `pnpm test:integration`: 8 aprovados.
- `pnpm test:browser`: 18 cenários aprovados, 9 desktop e 9 celular. Inclui os fluxos anteriores, v1/v2 imutáveis, autosave/retry, conflito com modal, tipos seleção/número/data, revisão na API, arquivamento e autorização. Total: 128 testes/cenários.
- Axe WCAG A/AA sem violações nas telas exercitadas; viewport móvel sem overflow horizontal. Captura da prévia móvel examinada. Auditoria premium estrita sem apontamentos; lint, tipos, formatação e build aprovados.
- Limites: testes móveis usam Edge com viewport/touch simulado; homologação em aparelho físico e produção continuam posteriores. Cópia local de conflito fica apenas na memória da aba e é perdida se o usuário confirmar seu descarte; não há cache offline, merge automático ou force overwrite.

## Tarefa 8 — programação e recorrências em 28/10/2026

- Criados contratos públicos e calendário puro em `packages/scheduling`, módulo schedules, quatro entidades relacionais e migração 202610280002. API para criação, consulta, atualização de nome/situação, candidatos elegíveis e atribuições com filtros/paginação no SQL.
- Ruling: cada ocorrência é compartilhada entre os responsáveis selecionados; haverá uma inspeção vinculada na etapa seguinte. Configuração de calendário/formulário/escopo/responsáveis fica fixa após criação para não reescrever atribuições; nome/situação são editáveis com revisão otimista. Mudança da configuração exige nova programação. Custo: administrador cria substituição quando precisar mudar calendário.
- Frequências única/diária/semanal/mensal, vigência inclusiva, dia mensal limitado ao fim do mês sem perder âncora, timezone IANA America/Sao_Paulo e prazo em horas reais. Horário inicial inexistente é rejeitado; slot recorrente inexistente é pulado, e horário repetido escolhe primeiro instante.
- Cursor persistido e transação com lock da programação/constraint única de ocorrência. Versão publicada fixada na materialização; retries não duplicam atribuição nem responsáveis. Pausa cancela apenas ocorrências futuras; retomada revalida acesso/configuração e restaura ocorrências existentes quando apropriado.
- Worker BullMQ real importa entrypoint servidor da API sem abrir HTTP. Varre até 100 cursores a cada 30 segundos e antecipa sete dias, recuperando backlog. JobId inclui revisão operacional; chave de domínio permanece estável. Jobs falhados ainda ativos são retomados pela varredura; erro de configuração suspende a programação com auditoria.
- Escopo de gestores e colaboradores aplicado antes da contagem. Candidatos retornam apenas id/nome elegíveis no setor. Validação trava usuários/unidade/setor e revalida o papel após refresh; revogação não é ignorada. Administrador mantém acesso global auditado.
- Telas de programação, revisão, pausa/retomada e atribuições próximas/pendentes/vencidas/canceladas; seleção remota paginada, campos e diálogos comuns. Nome não salvo bloqueia mudança de situação. Criação substitui sua entrada de histórico, preservando beforeunload no detalhe. Sem botão fictício de execução.
- Testes do calendário e processador falharam pela ausência dos módulos. Revisão independente identificou retrocesso/travamento do cursor, jobs retidos bloqueando retomada/recuperação, perda de nome ao alterar situação, rebaixamento concorrente e Voltar após criação. Reproduzidos em testes e corrigidos; revisão posterior sem bloqueadores.
- Integração real Redis/PostgreSQL confirma duplicatas concorrentes, restauração com job concluído e recuperação de job falhado sem duplicar ocorrência. Teste de perfil passou de resposta indevida 200 para 403 após revalidação. Migração alinhada ao ORM e ciclo completo down/up aprovado.
- Teste antigo de TRUNCATE de versões passou a usar CASCADE no banco temporário para alcançar o trigger de imutabilidade, pois a nova FK de atribuições já bloqueia TRUNCATE simples. O trigger continua rejeitando a operação e preservando os dados.
- Browser runner agora inicia worker em fila aleatória exclusiva e remove somente essa fila após encerrar seus processos; filas/dados do portal permanecem isolados. Corrigida a automação para aguardar dados da tabela e considerar as sete ocorrências diárias, em vez de exigir uma única linha.

### Evidências da tarefa 8

- `pnpm test`: 56 aprovados; `pnpm test:e2e`: 62 aprovados; `pnpm test:integration`: 9 aprovados.
- `pnpm test:browser`: 22 cenários aprovados (11 desktop, 11 celular). Rodada focada posterior: 4 cenários aprovados, incluindo formulário preenchido com axe. Total: 149 testes/cenários distintos.
- Lint, tipos, formatação, build e auditoria premium estrita aprovados. Sem violações WCAG A/AA nas telas exercitadas. Captura móvel do cadastro preenchido examinada visualmente.
- Migração 202610280002 aplicada ao banco local; API/web reiniciados e worker iniciado. Health ready: PostgreSQL/Redis/MinIO up; Redis confirmou um worker e scheduler registrado. `/schedules` sem sessão redireciona a `/login`.
- Limites: execução/respostas/evidências pertencem à etapa 9. Validação móvel automatizada usa viewport/touch no Edge; homologação física e implantação de produção continuam posteriores. Não há envio de mensagens externas nem contas/senhas padrão criadas.
