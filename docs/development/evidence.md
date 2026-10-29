# Observações e evidências de inspeção

Implementação da parte final da tarefa 9. Respostas, observações e vínculos de evidência compartilham a revisão otimista da inspeção. Observações têm até 2.000 caracteres por pergunta; somente perguntas visíveis entram na conclusão. Cada ciclo conserva sua própria cópia de observações e metadados de arquivos.

## Organização

- `apps/api/src/files`: validação, entidade, serviço transacional, controladores e adapter MinIO.
- `packages/contracts/src/files.ts`: política de envio, metadados e recibos de revisão.
- `apps/web/src/features/inspection-runner/evidence-controls.tsx`: seleção, envio, retentativa e desvinculação.
- `evidence-download.tsx`: autorização e link de download com validade curta.
- `apps/api/src/schedules/runtime.ts` e worker: composição do job de limpeza.
- Migração `202610280004`: observações, snapshots de evidências e artefatos persistidos.

## Transporte e autorização

| Rota                           | Entrada/resultado                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| GET `/api/files/policy`        | Tipos permitidos, limite de bytes e quantidade. Exige sessão.                                                         |
| POST `/api/files/prepare`      | inspectionId, questionId, revision, filename, mime, size e uploadId opcional. Retorna ID, validade e caminho binário. |
| PUT `/api/files/:id/content`   | `application/octet-stream`, sem multipart.                                                                            |
| POST `/api/files/:id/finalize` | revision; retorna nova revisão e lista de evidências.                                                                 |
| POST `/api/files/:id/detach`   | revision; desvincula do rascunho e retorna recibo.                                                                    |
| GET `/api/files/:id/download`  | Após autorização, retorna URL assinada de 60 segundos.                                                                |

A API reaplica o acesso da inspeção em cada operação. Somente o autor do preparo transfere/finaliza seu arquivo; criador e responsáveis podem desvincular no rascunho. Gestores consultam/downloadam dentro de seu escopo. Inspeções concluídas não aceitam alteração de evidências. Chaves de objetos não são aceitas nas mutações nem incluídas nos metadados de arquivo; o caminho aparece somente no link de download autorizado.

O BFF aceita binário somente no PUT de conteúdo de arquivos com UUID válido, com origem exata e limite absoluto de 25 MiB. Demais mutações continuam exigindo JSON e limite de 2 MiB. O limite efetivo por arquivo vem da API: `EVIDENCE_MAX_BYTES`, padrão 10 MiB, máximo configurável 25 MiB. Há até 5 arquivos por pergunta e 20 por inspeção. Envios preparados expiram em 15 minutos.

## Persistência e compensação

O preparo gera/persiste chaves aleatórias `temporary/<uuid>` e `evidence/<uuid>` antes de qualquer upload. A seleção na interface fornece um uploadId estável para repetir um preparo cuja resposta se perdeu. A mesma identidade nunca permite trocar proprietário, inspeção, pergunta ou conteúdo preparado.

Estados: PENDING → UPLOADED → READY. CLEANED encerra temporários expirados. O upload verifica extensão, MIME permitido, assinatura de conteúdo, tamanho real e SHA-256. O conteúdo UPLOADED fica fixado; repetir o mesmo binário é idempotente. Finalizar relê tamanho/assinatura/hash antes de promover e incrementa a revisão da inspeção.

Ruling: as operações de armazenamento durante promoção mantêm o lock da inspeção — evita vinculação tardia após uma conclusão e corridas de compensação — custo: operações da mesma inspeção aguardam o I/O. Requisições ao MinIO têm cancelamento real por timeout; respostas transitórias não acionam o backoff prolongado do SDK dentro da transação. Envios são pequenos e de uma parte. Para escala maior, substituir por protocolo de promoção com leases e intenções persistidas, preservando as invariantes.

Se uma cópia tiver sucesso e a confirmação posterior falhar, a compensação remove o destino antes de liberar o lock. Caso o processo caia ou o commit falhe, ambas as chaves continuam conhecidas pelo registro do preparo; retry ou limpeza podem recuperar. Falha ao remover o temporário após confirmação não desfaz READY: `tempCleaned=false` mantém a intenção de limpeza.

O job `cleanup-uploads`, a cada 15 minutos, processa lotes de até 100 registros sob lock de inspeção/artefato. Remove temporário e destino de uploads expirados ainda não finalizados, ou somente a sobra temporária de READY. Falha é repetida pelo BullMQ e pela próxima varredura. Objetos READY finais, inclusive desvinculados, têm retenção indefinida; a limpeza nunca os apaga. Metadados são preservados.

A conclusão bloqueia envios visíveis pendentes ainda válidos e congela apenas arquivos READY de perguntas visíveis. Desvincular num ciclo reaberto não muda snapshots anteriores. URLs assinadas não são persistidas; um link já emitido pode permanecer utilizável por até 60 segundos após revogação de acesso. O bucket não recebe política pública; um bucket com política anônima é rejeitado no preparo.

## Interface e verificação

O autosave inclui respostas e observações. Antes de anexar/remover, a interface grava a geração mais recente e bloqueia alterações durante a transferência. `DraftSession.acceptRevision` só reconhece o recibo quando não há geração local pendente. Falha mantém seleção e respostas; progresso de bytes indica transferência para o portal, seguido de validação/finalização explícita. Há cópia local do arquivo selecionado, cancelamento de envio e confirmação para desvincular.

O download requer preparar o link e abri-lo por ação explícita; isso evita popup bloqueado e mantém a validade curta visível. JPEG, PNG, WEBP e PDF são anexos privados; não há transcodificação nem promessa de operação offline.

Testes HTTP usam storage em memória com falhas induzidas e PostgreSQL descartável. Integração verifica MinIO real, negação anônima, checksum/conteúdo, URL e cleanup restrito. Browser usa bucket e fila aleatórios exclusivos. `cleanupEvidenceTestBucket` recusa qualquer bucket sem o prefixo gerado de testes e qualquer endpoint não local; nunca remove o bucket de desenvolvimento.
