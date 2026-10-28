# Programação de inspeções

## Decisões da etapa 8

Uma programação define nome, modelo publicado, unidade/setor, responsáveis, frequência ONCE/DAILY/WEEKLY/MONTHLY, data/hora inicial, fim de vigência opcional e prazo em horas corridas. Timezone único America/Sao_Paulo. Sem cron livre. Sem notificações externas nesta etapa.

Uma ocorrência é uma atribuição compartilhada entre os responsáveis selecionados, com unicidade `(scheduleId, occurrenceAt)`. A etapa de execução poderá vinculá-la a uma inspeção única. A versão do formulário será fixada na materialização, preservando sua referência. Publicações posteriores não alterarão atribuições existentes.

O worker materializa até sete dias à frente e recupera ocorrências pendentes após interrupção, sem descartar o cursor. Cada transação avança o cursor somente com sua atribuição. Fila pode repetir; o banco é a autoridade de idempotência. A chave externa deve corresponder à programação e instante; chaves divergentes não autorizam outra ocorrência.

Mensal usa o dia original, limitado ao último dia do mês (31/jan → 28/fev → 31/mar). Semanal repete o dia inicial a cada sete dias. O prazo soma horas reais ao instante da ocorrência. Vigência final inclui o dia local. Horário inicial inexistente é rejeitado; repetições em horários inexistentes são puladas, mantendo a âncora original. Em horário repetido escolhe-se o primeiro instante. O calendário usa IANA do runtime, sem assumir offset UTC fixo.

Formulário, escopo, responsáveis e calendário são imutáveis após criação; alteração desses dados exige nova programação. Nome/situação podem ser alterados. Pausar cancela somente atribuições futuras ainda planejadas; pendências anteriores são preservadas. Retomar considera o calendário a partir do momento atual e pode restaurar ocorrências futuras canceladas da mesma configuração. Sem exclusão física.

ADMIN tem escopo global auditado. MANAGER só administra programações em setores autorizados. Responsáveis precisam estar ativos, com senha definitiva e autorização atual para a unidade/setor. Seleção de responsáveis é paginada e limitada ao setor escolhido. Listas e contagens aplicam escopo no SQL. Colaborador só consulta atribuições próprias, e todos os acessos reavaliam vínculos atuais.

Se a materialização não puder usar o escopo, formulário publicado ou responsáveis, suspende a programação com motivo legível e auditoria. Retomar exige revalidar tudo. Atribuições continuam identificando o conjunto original de responsáveis; revogações de acesso não são ignoradas na leitura ou na futura execução.

## API e revisão

| Rota                             | Permissão               | Comportamento                                                                    |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| GET/POST `/api/schedules`        | ADMIN/MANAGER           | Lista paginada com q/isActive; criação com configuração completa                 |
| GET/PATCH `/api/schedules/:id`   | ADMIN/MANAGER no escopo | Consulta; altera name/isActive com revision obrigatória                          |
| GET `/api/schedules/candidates`  | ADMIN/MANAGER no escopo | unitId/sectorId, q/page/pageSize; somente id/nome elegíveis                      |
| GET `/api/schedules/assignments` | Autenticado             | state/page/pageSize; colaborador vê somente ocorrências próprias no escopo atual |

Revision controla configuração/situação. Avançar o cursor não muda essa revisão; pausar, retomar ou renomear muda. Gravação antiga retorna 409. Nome não salvo bloqueia mudança de situação na tela. Permissão é revalidada dentro da transação após os locks.

## Worker e operação

O worker importa somente o entrypoint servidor `@portal/api/scheduling`, que compõe ORM e domínio sem iniciar HTTP. Migre o banco antes de iniciar o worker. O calendário puro é compartilhado em `packages/scheduling`; autorização e persistência ficam na API.

```powershell
pnpm build
pnpm --filter @portal/api db:migrate
pnpm --filter @portal/worker start
```

Fila padrão: inspection-schedules. SCHEDULE_QUEUE_NAME permite isolamento e SCHEDULE_POLL_MS define a varredura (padrão 30000 ms, mínimo 1000 ms). Busca até 100 cursores por vez. Cada job materializa uma ocorrência e o ciclo seguinte progride o cursor, inclusive no backlog após indisponibilidade.

A chave de domínio é programação+instante, única no PostgreSQL. JobId acrescenta a revisão operacional para permitir retomada mesmo com job anterior concluído. Falhas transitórias têm cinco tentativas com backoff; se esgotadas, a próxima varredura tenta novamente enquanto o cursor estiver ativo. Falhas de configuração suspendem a programação e exigem correção/retomada. Redis não substitui a unicidade transacional do banco.

Testes de navegador usam banco temporário e fila aleatória exclusiva, removidos ao final. Não compartilham jobs com o portal. A integração real testa repetição, job concluído seguido de retomada e falha retida recuperada, sem duplicar ocorrência. HTTP cobre escopo, revisão, perfil alterado durante a operação, suspensão e estados próxima/pendente/vencida. Execução das inspeções pertence à etapa 9; a interface atual não apresenta ação de execução fictícia.
