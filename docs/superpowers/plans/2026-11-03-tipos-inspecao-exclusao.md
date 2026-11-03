# Tipos e exclusão — plano de implementação

Design: `docs/superpowers/specs/2026-11-03-tipos-inspecao-exclusao-design.md`, aprovado com “pode seguir”. Execução inline, preservando alterações anteriores.

- [x] Testar exclusão administrativa com revisão, rascunho físico e publicação preservada; implementar remoção e confirmação no catálogo.
- [x] Acrescentar vínculo opcional de formulário ao cadastro existente de tipos por unidade. Validar escopo e compatibilidade na API e consultas; permitir associação administrativa de modelos existentes.
- [x] Substituir tipos fixos pelo cadastro por unidade na importação e execução/programação. Atualizar os rótulos de Setor e manter IDs/rotas legados por compatibilidade.
- [x] Verificar migração/schema, tipos, lint, testes HTTP e fluxo no navegador. Aplicar migração local e documentar limitações.

Decisões: exclusão de publicado é lógica e impede novas utilizações; históricos continuam legíveis. Rascunhos vinculados a programação não são apagados fisicamente. Modelos legados sem tipo continuam utilizáveis até associação administrativa, sem migração por inferência do nome.
