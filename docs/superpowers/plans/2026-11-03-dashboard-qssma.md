# Dashboard QSSMA — plano

Design: `docs/superpowers/specs/2026-11-03-dashboard-qssma-design.md`. Confirmado pelo usuário: desvio tratado exige plano concluído/aprovado. Execução inline, preservando mudanças anteriores.

- [x] Acrescentar filtros cliente/local/colaborador às consultas e exportações existentes, com limites de acesso e IDs históricos.
- [x] Testar e implementar endpoint QSSMA com medidas por inspeção e colaborador/dia, metas 12/95, agrupamentos mensais, dimensões e desvios tratados por plano concluído. Última conclusão por inspeção, timezone São Paulo.
- [x] Implementar gráficos locais acessíveis (colunas/barras/roscas), cartões, filtros e tabela detalhada paginada; manter as fórmulas e os estados antigos documentados.
- [x] Verificar API, regressões de relatórios, tipos, lint, build, acessibilidade e desktop/celular. Revisão independente e documentação final.

Restrições: nenhuma linha do PBIX importada, nenhuma chamada SharePoint/Power BI, nenhum REMOVEFILTERS que remova permissões. Prioridade Crítica permanece separada. Rankings limitados aos dez maiores e identificados como tal; distribuições de criticidade/status incluem o conjunto inteiro. Sem base retorna nulo, não conformidade fictícia de 100%.
