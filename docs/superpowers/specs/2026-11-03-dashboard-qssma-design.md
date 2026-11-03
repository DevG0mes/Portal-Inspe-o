# Dashboard do portal baseado em QSSMA.pbix

## Fonte verificada

Arquivo local QSSMA.pbix, 1.501.111 bytes, lido após download do OneDrive. Páginas QSSMA, Desvio Geral e Página 1. Metadados e fórmulas DAX analisados; registros históricos não importados. O protótipo HTML da pasta é referência auxiliar, não fonte de valores reais para o portal.

## Indicadores e gráficos identificados

| Conteúdo do PBIX | Implementação proposta no portal |
| --- | --- |
| Total de inspeções, inspeções sem/com NC | Cartões com protocolos concluídos distintos, usando a última conclusão de cada inspeção |
| Total de desvios, criticidade alta, em andamento e tratados | Cartões sobre ocorrências e seus planos de ação |
| Taxa de conformidade | Indicador por colaborador/dia conforme o DAX, identificado claramente; taxa por resposta atual mantida como indicador distinto |
| Dias com/sem desvio | Quantidade de combinações colaborador/data, não dias consecutivos nem contagem simples do calendário |
| Meta de inspeções/mês | 12, valor confirmado na tabela Metas_QSSMA; alvo mensal explícito, não multiplicado silenciosamente por usuário/local |
| Meta de conformidade | 95%, valor confirmado em Metas_QSSMA, aplicado ao indicador por colaborador/dia |
| Evolução mensal de inspeções | Colunas mensais em ordem cronológica, com referência da meta |
| Evolução mensal dos desvios | Colunas por mês |
| Evolução dos tratados | Colunas agrupadas por mês de origem da ocorrência, com total/tratados e legenda explícita |
| Inspeções por tipo, obra/local e colaborador | Barras horizontais, ordenadas por quantidade |
| Desvios por categoria | Barras horizontais; corrigir a restrição antiga específica de Inspecao_EPC para respeitar unidade/tipo escolhidos |
| Status e criticidade | Gráficos de rosca com legenda, valores e equivalente textual acessível |
| Desvio Geral | Tabela paginada: protocolo, situação, tipo, local, cliente, pergunta e ação realizada |

## Filtros

Período, unidade, tipo, formulário, cliente, local e colaborador, com seletores e envio explícito existentes. Filtros de cliente/local/colaborador precisam ser acrescentados à API e aplicados antes de agrupar/contar/paginar, respeitando o acesso por unidade/tipo e o escopo pessoal dos colaboradores. Não copiar REMOVEFILTERS() como remoção de permissões: um eventual cartão global continua limitado ao escopo autorizado e claramente separado do recorte filtrado.

## Diferenças de negócio que precisam de concordância

1. O PBIX chama `_Total de Inspeção Distinta (Dia)` a contagem de pares colaborador/data. Sua conformidade deriva desses pares, enquanto o portal atual calcula conformidade por respostas avaliáveis. Proposta: apresentar ambos com nomes diferentes, sem substituir uma fórmula pela outra.
2. PBIX considera tratados registros com status Tratado/Fechado. No portal há ação registrada na inspeção e plano de ação com aprovação gerencial. Proposta: considerar tratado somente o desvio cujo plano está Concluído; ação textual obrigatória por si só não fecha a ocorrência. Sem plano, o desvio fica pendente. Não alterar estados do domínio para atender ao gráfico.
3. PBIX tem criticidades Alta/Média/Baixa; portal possui também Crítica. Proposta: preservar as quatro faixas na distribuição, sem esconder Crítica dentro de Alta.

## Direção técnica e visual

Estender a API e o dashboard atuais com os dados reais do portal, usando a identidade PSI e componentes existentes. Não incorporar o Power BI nem importar seus registros: isso manteria outra base e exigiria acesso/licença externa. Gráficos locais responsivos, acessíveis por teclado e com legendas/tabelas equivalentes. Sem valores fictícios, conteúdo DAX HTML executado ou dependência de recursos remotos.

## Verificação prevista

Testes com múltiplas inspeções no mesmo colaborador/dia, dias sem dados, NC sem plano, planos pendentes/aprovados, reabertura, duas unidades e clientes homônimos, filtros e agregação por mês em São Paulo. Conferir exportações existentes, isolamento, estado vazio, falha/retry e desktop/celular.

Status: aprovado pelo usuário e implementado. Fórmulas e adaptações documentadas em `docs/development/dashboard-qssma.md`; validação registrada no histórico de desenvolvimento.
