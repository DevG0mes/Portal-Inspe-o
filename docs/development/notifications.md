# Notificações internas

Etapa 11. Avisos permanecem no portal e não enviam e-mail ou mensagens externas. Eventos de atribuição de inspeção/plano, proximidade do prazo, vencimento, solicitação de validação, aprovação e devolução produzem registros por destinatário. Validação avisa administradores e gestores ativos com acesso ao setor; decisões avisam o responsável atual.

`emitOnce` usa o EntityManager da transação de negócio, constraint única `(recipientId, eventKey)` e `ON CONFLICT DO NOTHING`. Rollback remove tanto negócio quanto aviso; retry não duplica nem desfaz leitura. Conteúdo é genérico: tipo de evento e referência interna, sem copiar respostas, nomes de arquivo ou descrições privadas. Não há endpoint público de emissão.

Ruling: atribuição avisa quando a ocorrência é materializada (até sete dias antes); retomada da mesma ocorrência preserva o aviso — reutiliza a identidade de domínio — custo: não há aviso separado de retomada. O link abre a lista autorizada de atribuições; planos têm link direto para o detalhe.

Ruling: proximidade significa até 24 horas antes do prazo. O worker existente processa `notify-deadlines` a cada 15 minutos, até 100 destinatários de planos e 100 de inspeções por execução — aproveita a fila e a política de retries existentes — custo: backlog acima desse lote leva mais de uma execução. Anti-join com avisos já emitidos evita que o primeiro lote bloqueie os posteriores. Chave inclui instante de prazo em epoch e destinatário; mudar prazo permite novo aviso. Conclusões, cancelamentos, contas inativas e vínculos inválidos são excluídos. Não se emite proximidade retroativa depois de vencer: emite-se vencimento.

Lista e contagem filtram destinatário antes da paginação. Leitura individual e em lote são idempotentes; outra pessoa recebe 404. Link é recalculado com a autorização atual em cada consulta. Avisos antigos permanecem, mas mostram registro indisponível após revogação, reatribuição ou remoção do recurso. O recurso também revalida autorização ao abrir. UUID de referência não concede acesso.

Central `/notifications`: paginação, filtro de não lidas na URL, atualização explícita, leitura individual/em lote, estados vazio/carregamento/erro. Indicador na navegação atualiza ao mudar rota, marcar leitura, voltar à aba e a cada minuto enquanto visível. Falha do indicador não bloqueia a navegação. Não há promessa de entrega instantânea ou push do navegador.

Observação operacional: `emitted` no retorno da varredura conta tentativas do lote; em corrida de dois workers pode superar o número inserido, pois o conflito é ignorado. A constraint continua garantindo um único aviso. Essa contagem não é usada como métrica de negócio nem para avançar cursor.
