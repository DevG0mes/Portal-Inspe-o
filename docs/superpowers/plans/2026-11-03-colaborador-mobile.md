# Plano de implementação — colaborador e layouts

**Objetivo:** acesso pessoal de inspeções com escolha Desktop/Celular depois do login.
**Spec:** `docs/superpowers/specs/2026-11-03-colaborador-mobile-design.md`.
**Arquitetura:** Next.js e componentes existentes, cookie de apresentação sem autoridade de acesso, API Nest com autenticação atual revalidada. Sem novas dependências ou migrações.

- [x] Testar e implementar bloqueio das funções de gestão para colaborador, preservando criação/execução de inspeções próprias/atribuídas e PDF pessoal. Atualizar elegibilidade de correções e avisos.
- [x] Implementar seleção autenticada Desktop/Celular e troca posterior; login e troca de senha conduzem à escolha. Persistir apresentação na sessão e proteger destinos no servidor.
- [x] Criar início pessoal e navegação do colaborador; modo Celular compacto com navegação inferior. Reutilizar listas, identificação e histórico.
- [x] Adaptar execução mobile por seção, mantendo respostas, validação, autosave e evidências. Erros levam à seção correspondente.
- [x] Verificar testes HTTP/unitários, build/tipos/lint e navegador nos dois modos; documentar regras e limites.

Preservar mudanças locais anteriores, a branch atual e dados existentes. Não publicar nem alterar credenciais. Verificar acesso direto, troca de papel durante sessão e escolha de layout que não concede permissões.
