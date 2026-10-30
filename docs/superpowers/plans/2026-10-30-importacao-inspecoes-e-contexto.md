# Plano — importação e contexto das inspeções

Referência: `docs/superpowers/specs/2026-10-30-importacao-inspecoes-e-contexto-design.md`. Base 853b9dd. Plano preparado após análise do CSV e definição de vínculos/participação pelo usuário; validação do desenho antes de mudanças de domínio.

Concluído em 30/10/2026. Ajuste de execução: as quatro etapas são integradas em um commit, pois compartilham os mesmos contratos, entidades e registros de migração. Evidências completas e limites em `docs/development/progress.md`.

## 1. Conversão e importação assistida

- [x] Testes que falham para cabeçalho CSV, pergunta 3, 29 pares, NO obrigatório, metadados ignorados, aspas/acentos, duplicatas e referências inválidas.
- [x] Conversor puro com diagnóstico e perfil explícito do modelo EPC, reaproveitando RuleEngine e contratos existentes.
- [x] Endpoint administrativo que cria rascunho com revisão/idempotência/auditoria; nenhum histórico importado ou publicação implícita.
- [x] Seleção de arquivo, prévia, confirmação e revisão no construtor. Sem envio desnecessário de linhas com dados pessoais.
- [x] Testes unitários/HTTP/navegador e integração conjunta.

## 2. Clientes e locais

- [x] Testes de cadastro, cliente em várias unidades, locais por cliente, inativação, duplicatas e isolamento por escopo.
- [x] Entidades/migração, serviços e contratos com paginação/validação atuais e revalidação transacional de vínculos.
- [x] Administração e seletores remotos pelos componentes canônicos. Deativação preserva histórico.
- [x] Schema/migração down/up, contratos HTTP, teste móvel/desktop e integração conjunta.

## 3. Contexto da inspeção e participantes

- [x] Testes para unidade/cliente/local incompatíveis, participantes apenas descritivos e compatibilidade com inspeções antigas.
- [x] Persistir identificação histórica, clientes/locais e participantes; transportar contexto em programação e materialização idempotente.
- [x] Atualizar criação/consulta/conclusão/PDF sem mudar permissões dos participantes ou regras dos ciclos.
- [x] Regressão de escopo, histórico, programação, relatórios, navegador e integração conjunta.

## 4. Entrada por unidade e tipo

- [x] Relacionar unidades e modelos/tipos de inspeção, preservando catálogos e formulários existentes.
- [x] Entrada guiada com contexto selecionado e os cinco tipos EPC; só formulários publicados com conteúdo podem iniciar inspeção.
- [x] Informar conteúdo ainda não cadastrado; não gerar os outros quatro questionários sem suas fontes.
- [x] Caminho crítico completo, acessibilidade, revisão independente, documentação e integração conjunta.
