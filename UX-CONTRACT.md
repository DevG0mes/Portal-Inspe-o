# Contrato de interação

Portal interno pt-BR. A API é a autoridade de permissões e estado. Nenhuma credencial fica em localStorage. A sessão usa cookie HttpOnly e verificação no servidor em cada navegação protegida.

| Capacidade     | Proprietário canônico                          | Comportamento e verificação                                                                                                                                                |
| -------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form           | `packages/ui/src/index.tsx`, `features/shared` | Rótulos visíveis, noValidate, erro associado ao campo, foco no primeiro erro; submit bloqueado enquanto pendente. Testes de componentes e navegador.                       |
| Select/Listbox | `Select` compartilhado                         | Select nativo: geometria, teclado e popup pertencem ao sistema operacional. Escolhas remotas paginadas, sem truncamento silencioso.                                        |
| Scrollbar      | `globals.css`                                  | Scroll do documento, gutter estável, cores dos tokens, forced-colors preservado.                                                                                           |
| Toast          | `Notice` compartilhado                         | Mensagens inline persistentes com status/alert; sucesso anunciado, sem desaparecimento automático.                                                                         |
| CRUD           | `features/admin`                               | Listas com paginação da API, busca, filtros, loading, vazio e erro com tentar novamente. Criar/editar retorna à lista; desativação preserva histórico e exige confirmação. |
| Dialog         | `ConfirmDialog`                                | Dialog modal nativo, Escape cancela, foco inicial no cancelamento e retorno ao acionador. Operações pendentes impedem reenvio.                                             |
| Navegação      | `PortalShell`                                  | Mesmos links em desktop/celular. Administração somente ADMIN. Link atual identificado. Menu móvel em fluxo, sem camada modal.                                              |

Busca de usuários contém dados pessoais e fica em memória; paginação e filtros não sensíveis usam URL. Senhas nunca entram na URL. Ações sem sessão exibem erro e link de reautenticação, sem repetição automática de gravações. Cancelar edição com alterações pede confirmação; beforeunload protege fechamento real. Não há exclusão definitiva, seleção em massa ou seletor de data nesta etapa.

Tokens: `packages/ui/src/tokens.css`. Layout: `globals.css`. Componentes e comportamento recorrentes devem ser estendidos nesses proprietários, sem cópias locais. Dashboard apresenta somente dados reais disponíveis. Não exibir ações para etapas futuras ainda inexistentes.

## Canonical UI Map

Programações: `features/schedules` estende listas, campos, seleção remota e confirmações comuns. Busca e filtros usam envio explícito/URL; seleção de formulário publicado e responsáveis usa paginação do servidor. Data/hora são controles nativos e todos os instantes exibidos seguem São Paulo. Troca de unidade/setor limpa responsáveis com aviso prévio no campo. Nome pendente bloqueia pausa/retomada até salvar. Criação substitui sua entrada de histórico para manter a proteção do Voltar por beforeunload no detalhe. Lista de atribuições oferece atualização explícita para novas ocorrências do worker. Nunca mostrar botão de execução até existir o fluxo correspondente.

Construtor: `features/form-builder` é o proprietário do editor e de seu autosave serializado (700 ms, suspenso durante composição IME). `features/form-preview` renderiza respostas; avaliação e validação usam o motor puro compartilhado `@portal/form-engine`, e a prévia enviada à API confirma o rascunho salvo. Seções/perguntas são ordenadas por botões acessíveis, sem drag obrigatório. Remoções exigem confirmação e não deixam referências quebradas. Conflitos interrompem gravações; conteúdo local permanece copiável até recarregar com confirmação. Publicação/arquivamento são explícitos. Falha de gravação conserva a edição e exige tentativa manual.

Campos DATE da prévia usam input date nativo (popup, teclado e formato visual do sistema), transportando YYYY-MM-DD. Busca do catálogo usa envio explícito; estado/página/busca são restituíveis na URL. Os demais contratos de formulário, diálogo, avisos, hidratação e proteção de saída continuam comuns.

| Capability     | Canonical owner                                  | Source of truth               | Allowed variants             | Verification                           |
| -------------- | ------------------------------------------------ | ----------------------------- | ---------------------------- | -------------------------------------- |
| Select/Listbox | packages/ui/src/index.tsx                        | UX-CONTRACT.md                | native, remote paginated     | apps/web/e2e/auth-admin.spec.ts        |
| Form           | features/admin/resource-form.tsx and packages/ui | API contracts, UX-CONTRACT.md | create, edit, reset          | auth-form.test.tsx, auth-admin.spec.ts |
| Scrollbar      | apps/web/src/app/globals.css                     | DESIGN.md                     | document                     | browser narrow viewport, forced-colors |
| Toast          | Notice in packages/ui                            | UX-CONTRACT.md                | inline success, error        | auth-form.test.tsx, auth-admin.spec.ts |
| CRUD           | features/admin                                   | API contracts, UX-CONTRACT.md | paginated, soft deactivation | apps/web/e2e/auth-admin.spec.ts        |
| Date           | packages/ui Input in features/form-preview       | UX-CONTRACT.md                | native                       | apps/web/e2e/form-builder.spec.ts      |

## Execução de inspeções

`features/inspection-runner` é proprietário da listagem, criação e execução. `features/shared/draft-session.ts` passa a ser o proprietário do autosave serializado genérico; o construtor mantém uma fachada de importação compatível. `features/shared/question-field.tsx` é o renderizador editável dos tipos de resposta, usado pela prévia e pela execução.

Criação avulsa usa seletores remotos paginados e confirmação; navegar para o registro substitui a entrada de criação. Atribuições iniciam por navegação de documento e retomam o mesmo ID compartilhado. As ações disponíveis e o estado de execução vêm da API. Prazo e situação de execução são exibidos separadamente.

Autosave de 700 ms pausa em IME, serializa gerações e preserva digitação recente. Falha exige retry explícito; conflito interrompe a escrita e disponibiliza uma cópia local antes do descarte confirmado. Recarregamento explícito nunca monta o editor com dados da revisão anterior. Sem armazenamento offline. Beforeunload e DirtyGuard protegem alterações pendentes.

Revisar/concluir espera a última gravação, valida o conteúdo visível com o motor compartilhado e foca o primeiro campo inválido. A confirmação bloqueia edição; concluir usa a revisão confirmada e o ciclo. Retentativa manual após falha de resposta é idempotente no servidor. Conclusões exibem perguntas/respostas aceitas e ocorrências por ciclo; reabertura exige justificativa. Verificação em `apps/web/e2e/inspection.spec.ts`, incluindo teclado/foco, falhas, duas abas, WCAG A/AA e viewport móvel.
