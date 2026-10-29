# Relatórios privados — PDF e Excel

Etapa 13. PDF é solicitado em uma conclusão de inspeção; XLSX parte dos filtros aplicados ao painel. Os arquivos são gerados pelo worker, armazenados no bucket privado e acessíveis na central individual `/reports`. Mesmo administrador não consulta pedidos de outra pessoa. Não há envio externo, URL pública permanente ou exportação síncrona pelo HTTP.

Ruling: PDF registra um ciclo selecionado, seu formulário versionado, respostas visíveis, notas, ocorrências, evidências e planos/históricos autorizados dessa conclusão — preserva um documento identificável — custo: outros ciclos precisam de pedidos próprios. Colaborador que consulta sua inspeção não recebe, pelo PDF, planos de outra responsabilidade que não pode abrir na aplicação. Histórico de plano inclui autoria, data, justificativa, atribuição e metadados de evidências de cada tentativa.

Ruling: Excel registra resumo, evolução, lista completa de ocorrências e planos do recorte autorizado, com uma aba de filtros/metodologia — segue as mesmas fórmulas e populações do painel — custo: é um documento estático. Indicadores não são recalculados por fórmulas paralelas na planilha. Números/datas permanecem tipados; strings de usuário nunca são objetos de fórmula, hyperlinks externos ou macros. Horários são campos de São Paulo; cabeçalhos e metadados explicitam o fuso. Não há truncamento silencioso de listas.

## Reserva e snapshot

`requestId` único por usuário e hash do input tornam retries idempotentes. Mesmo ID com outro conteúdo retorna 409. Criação e retry respeitam até três pedidos pendentes por usuário, com lock de usuário antes do relatório. Não é necessário manter uma conexão enquanto se espera outra do mesmo pool.

A criação reserva uma vaga em READ COMMITTED e confirma essa transação. Depois prepara o snapshot em REPEATABLE READ, confirma o conteúdo e só então o pedido pode entrar na fila do worker. O snapshot recebe sua primeira publicação uma única vez e fica protegido por trigger contra alteração. Identidade/formato/hash também não mudam. Falha ou queda entre as fases não permite gerar um arquivo sem dados: reserva sem snapshot é excluída da varredura, expira após 15 minutos com REQUEST_INCOMPLETE e exige novo pedido. Não se captura conteúdo silenciosamente em momento posterior para esse pedido.

Limites: 5.000 registros por lista/coorte de Excel, até 1.000 planos e 1.000 eventos no PDF, snapshot de até 8 MiB e arquivo final de até 30 MiB. Exceder o limite exige um novo recorte. A preparação termina antes da resposta normal ao pedido; timeout de rede permite repetir o mesmo requestId e acompanhar o pedido já reservado.

Escopo congelado registra papel, setores e identidades das inspeções, atribuições e planos cobertos. Antes de gerar, ao publicar e ao preparar download, o backend revalida usuário ativo/senha definitiva, mesmo papel, vínculos e responsabilidade atual. Mudança de papel, revogação de um setor coberto ou reatribuição de um plano bloqueia o artefato antigo. Esse guard é deliberadamente conservador, inclusive em relatórios de resultado vazio. API retorna somente metadados do pedido, nunca snapshot ou chaves de armazenamento.

## Worker, falhas e limpeza

O scanner existente materializa jobs `generate-report` a cada varredura (padrão 30 segundos). Identidade da fila inclui tentativa. Claim sob lock muda QUEUED → PROCESSING e persiste a chave da tentativa antes de I/O. Lease de 15 minutos permite recuperar queda. Conclusão exige que a tentativa ainda possua o registro; renderização atrasada não substitui o sucessor. READY não é regenerado em duplicatas. FAILED pode voltar a QUEUED por ação explícita, no máximo cinco tentativas; erros de acesso, preparação incompleta e tamanho não recebem retry fictício na UI.

Upload parcial ou tentativa obsoleta é removido. Compensação consulta o estado sob lock antes de apagar: se COMMIT de READY aconteceu e só sua confirmação se perdeu, a chave atual é preservada. Sem poder confirmar o estado, o job não apaga um arquivo possivelmente publicado. Histórico durável das chaves (até cinco) permite limpeza posterior. O cleanup de uploads existente também revisita chaves obsoletas de relatórios, em lotes de 100, reagendando sua revisão em 24 horas. Isso recupera um upload tardio seguido de queda; nunca remove a chave atual de READY.

PDF incorpora até cinco prévias JPEG/PNG, leitura de até 10 MiB por arquivo/20 MiB acumulados e até 16 milhões de pixels por imagem. Hash é verificado. WEBP/PDF e imagens além dos limites permanecem identificados por nome/tipo/tamanho/checksum, com orientação para consultar o original no portal. Ausência ou erro de prévia é explicitado no documento. Não são gravadas URLs assinadas no PDF ou no snapshot. Noto Sans completa e sua licença ficam versionadas em `apps/worker/assets`; não dependem das fontes do computador.

## Interface e validação

Central individual paginada: fila, processamento, pronto e falha. Polling de 5–15 segundos apenas com pedidos pendentes da página/aba visível; mantém linhas e links prontos durante a consulta. Falha de leitura preserva dados e exige atualização explícita. Criação pede confirmação com o contexto do recorte; sucesso fecha o diálogo e deixa link de recuperação caso a navegação seja cancelada. Downloads reutilizam o proprietário `features/shared/private-download.tsx`: preparar, abrir explicitamente e expirar o link local. A URL do armazenamento vale 60 segundos; revogação posterior não cancela uma URL já emitida antes desse prazo.

Testes HTTP exercitam snapshot, privacidade, revogação, duplicação, limite de fila, dois clientes num pool de duas conexões, retries, lease, upload parcial/limpeza e confirmação de commit perdida. Renderizadores são reabertos com ExcelJS e verificados também com openpyxl/pypdf; PDF renderizado via Poppler. Browser usa worker, PostgreSQL, Redis e MinIO reais em namespaces descartáveis, sem alterar os dados locais.

Implementação usa [PDFKit](https://pdfkit.org/docs/getting_started.html) e [ExcelJS](https://github.com/exceljs/exceljs), com versões fixadas no manifesto/lockfile. As ferramentas locais de artefatos são usadas para inspeção dos arquivos de teste; os renderizadores do produto pertencem ao projeto e funcionam sem o ambiente do Codex.
