# Planos de ação — contrato operacional

Etapa 10 do plano aprovado. Cada plano referencia uma ocorrência exata `(submissionId, questionId)` de uma conclusão imutável; somente gestor/administrador no escopo pode criar/atribuir. Colaborador consulta e executa somente planos sob sua responsabilidade atual e com vínculo vigente no setor.

Ruling: há no máximo um plano por ocorrência; ciclos distintos preservam ocorrências e planos próprios — evita duplicação em retries sem apagar o histórico — custo: reabertura pode produzir uma nova ocorrência que exige decisão gerencial separada.

Estados: OPEN → IN_PROGRESS → AWAITING_VALIDATION → COMPLETED. Devolução justificada retorna a IN_PROGRESS. Prazo é data inclusiva em São Paulo; overdue é derivado e não substitui o estado. Gestor pode reatribuir/descrever/repriorizar/reprogramar apenas OPEN/IN_PROGRESS. Atribuição exige usuário ativo, senha definitiva e escopo vigente. O papel de gestor permite decidir; execução exige responsabilidade, inclusive para gestores.

Solicitar validação exige descrição da correção e ao menos uma evidência finalizada. Arquivos ficam bloqueados enquanto aguarda decisão ou após concluir. A solicitação congela metadados da evidência no histórico; devoluções e novas solicitações preservam todas as tentativas. Comentários podem ser adicionados aos estados existentes sem reabrir uma conclusão.

Ruling: gestor/administrador responsável também pode validar, pois o MVP aprovado não exige segregação de funções — todas as decisões retêm autoria e data — custo: homologação corporativa poderá exigir outra pessoa e uma regra adicional.

Comandos têm revisão otimista e commandId; retry do mesmo comando/ator/payload retorna o mesmo resultado quando nenhuma alteração posterior ocorreu. Reutilizar ID com outro conteúdo ou revisão vencida retorna 409. Histórico é append-only no PostgreSQL e confirmado com estado/auditoria na mesma transação. Locks seguem usuário(s) em ordem → unidade → setor → plano; anexos usam o mesmo lock do plano.

Evidências corretivas reutilizam o módulo privado de arquivos, limites e limpeza existentes. Responsável pode consultar somente a pergunta, observação e evidências da ocorrência original, sem ganhar acesso ao restante da inspeção. Downloads de origem precisam pertencer ao snapshot dessa ocorrência; arquivos de outras perguntas continuam protegidos.
