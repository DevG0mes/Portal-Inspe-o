# Dashboard QSSMA

## Referência e fonte dos dados

Referência de indicadores e visuais: `QSSMA.pbix` fornecido em 03/11/2026, com 42 medidas DAX e 27 elementos visuais. A análise leu apenas metadados; registros e conexões SharePoint não foram importados ou executados. Os números do dashboard vêm exclusivamente do banco do portal e respeitam a autorização atual.

## Fórmulas

| Indicador                              | Base no portal                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspeções realizadas                   | Última conclusão de cada inspeção no período, mesmo se reaberta                                                                                                        |
| Inspeções 100% conformes / com desvios | Inspeções sem / com ocorrência na última conclusão                                                                                                                     |
| Desvios                                | Ocorrências geradas pelas regras da versão publicada; no CSV padrão, respostas Não                                                                                     |
| Tratados                               | Ocorrências cujo plano está COMPLETED e possui data de conclusão, após aprovação gerencial                                                                             |
| Pendentes                              | Todos os demais desvios, incluindo sem plano e aguardando validação                                                                                                    |
| Situação dos desvios                   | Tratados, Pendentes (sem plano ou aberto), Em andamento, Aguardando validação                                                                                          |
| Conformidade por colaborador/dia       | Combinações de criador da inspeção e data de conclusão em São Paulo sem desvio / total de combinações × 100                                                            |
| Colaborador/dia com / sem desvio       | Não são dias consecutivos nem dias simples do calendário. Várias inspeções da mesma pessoa na data contam uma vez; qualquer ocorrência torna a combinação não conforme |
| Índice de conformidade por respostas   | Mantém a fórmula anterior: respostas avaliáveis sem ocorrência / respostas avaliáveis. NA de YES_NO_NA, vazias e perguntas sem regra ficam fora da base                |
| Média de desvios                       | Desvios / inspeções realizadas                                                                                                                                         |
| Metas                                  | 12 inspeções por mês e 95% de conformidade por colaborador/dia, valores lidos em Metas_QSSMA do PBIX                                                                   |

Sem denominador, taxas e médias mostram Sem base, sem supor 100% de conformidade. A ação textual obrigatória registra o que foi feito em campo, mas não conclui o plano nem torna o desvio tratado. Essa regra foi confirmada pelo usuário.

O cartão **Desvios no escopo completo** ignora filtros da tela e usa a última conclusão de cada inspeção em todos os períodos, preservando os tipos autorizados e o escopo pessoal. Equivale à intenção do Total sem Filtros do PBIX sem retirar permissões. É identificado separadamente dos valores do recorte e não é exportado para o Excel do recorte.

## Gráficos e filtros

- Colunas mensais de inspeções com meta, desvios e comparação desvios/tratados. Meses vazios aparecem com zero, em ordem cronológica. Tratados são agrupados pelo mês da inspeção de origem e representam o estado atual do plano, não a quantidade de aprovações ocorridas naquele mês. A meta mensal não é proporcional a períodos parciais nem multiplicada por filtros.
- Roscas de situação e criticidade com quantidades e percentuais. Crítica permanece separada de Alta; as distribuições consideram todo o recorte.
- Barras dos dez maiores tipos, locais, colaboradores e categorias. Locais agrupam por ID, usando o nome histórico da última conclusão selecionada; renomear um local não divide sua quantidade. Tipos/colaboradores usam IDs e nomes atuais. Sem local histórico aparece explicitamente.
- Tabela de ocorrências paginada com pergunta, formulário, protocolo (ID da inspeção), situação, cliente, local, tipo, categoria, prioridade, conclusão e ação realizada. O texto da ação é recuperado da resposta ao campo Ação Realizada condicionado à pergunta de origem, quando existir.

Período (até 366 dias), unidade, tipo, formulário, cliente, local, colaborador, categoria e prioridade são enviados explicitamente e preservados na URL. Alterar filtros reinicia a paginação. Clientes/locais/colaboradores do seletor são derivados dos registros autorizados, incluindo nomes históricos, em vez de depender da situação atual dos cadastros.

O Excel mantém os filtros e as regras anteriores do resumo por respostas e inclui cliente, local, situação e ação nas ocorrências. Os novos indicadores QSSMA e os gráficos estão na tela; não se deve interpretar o índice do resumo Excel como o indicador por colaborador/dia.

## Implementação e verificação

`analytics.queries.ts` mantém os filtros comuns parametrizados. `qssma.queries.ts` calcula as medidas e rankings no PostgreSQL. `/analytics/qssma` usa transação repeatable-read para manter cartões/distribuições/mensalidades coerentes. `/analytics/filter-options` fornece seleção remota paginada por escopo. A API e os filtros de relatórios aceitam customerId/locationId/inspectorId, sem mudar permissões ou estados do domínio.

`qssma-charts.tsx` é o proprietário dos gráficos locais SVG/meter, sem nova biblioteca. Séries mensais têm tabelas equivalentes, legendas e valores. Períodos curtos cabem no celular; períodos longos permitem rolagem com foco de teclado e instrução. Estados sem dados e erro/retry continuam nos componentes compartilhados. Cores usam tokens PSI e não são o único meio de identificar séries.

Testes cobrem pares colaborador/dia, versões/reabertura, limites de São Paulo, local renomeado, aprovação pendente/concluída, meses vazios, filtros históricos, volume de 4.500 inspeções em dois escopos e exportações privadas. Nenhuma migração, dado operacional de exemplo ou conexão Power BI foi adicionada.
