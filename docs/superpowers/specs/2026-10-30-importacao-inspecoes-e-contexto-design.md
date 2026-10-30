# Importação de inspeções e identificação operacional

Status: aprovado pelo usuário; implementação em validação. Base: 853b9dd. Solicitação e decisões de negócio recebidas em 30/10/2026.

## Objetivo

Criar automaticamente modelos a partir dos CSV existentes e oferecer identificação da inspeção por unidade de negócio, cliente, local e participantes. Manter a identidade PSI Energy e os fluxos autorizados/versionados do portal.

## Evidências e decisões confirmadas

- `Inspeção_EPC.csv`: UTF-8 com BOM, vírgula, 63 colunas e 173 registros anteriores. Quatro colunas são metadados (Status, Protocolo, Criado, Criado por); não viram perguntas nem são importadas como inspeções históricas nesta entrega.
- Trinta perguntas principais, numeradas de 1 a 30: pergunta 3, “Qual o tema de segurança aplicado na data da inspeção?”, em TEXT; as outras 29 em YES_NO_NA (Sim, Não, Não Aplicável). Os 29 campos Ação Realizada são TEXT e pertencem à pergunta de mesmo número.
- A ação aparece e é obrigatória somente com resposta NO da referência. YES e NA não exigem ação. O motor já suporta esse comportamento com `visibleWhen` e `required`; a conversão reaproveita essa autoridade no servidor, sem depender apenas da interface.
- Cliente pode atender várias unidades; local pertence a um cliente. Participantes são apenas identificados no registro, sem convite, mensagem ou concessão de edição.
- Referência de entrada: unidades SPCS, EPC e Alojamento. EPC tem os tipos Inspeção EPC, Trabalho em Altura, Espaço Confinado, Escavação e Atividade com Solda. O CSV fornece somente o primeiro conteúdo. Não inventar perguntas dos demais tipos nem oferecer ficha vazia para conclusão.

## Abordagem

Estender o construtor/versionamento atual com importação assistida é a opção adotada nesta proposta: preserva prévia, validação, revisão e publicação já existentes. Um formulário fixo em código dificultaria manutenção pelos administradores; importar automaticamente as 173 respostas misturaria migração histórica com criação de modelos e exigiria identificação/escopo que o arquivo não fornece.

## Importação de modelos

1. Administrador seleciona CSV e vê uma prévia das perguntas, tipos e pares de ação. Ler apenas o cabeçalho para criar o modelo; respostas e nomes de autores não precisam ser enviados ao servidor.
2. Normalizar BOM, espaços/nbsp e cabeçalhos; respeitar aspas/delimitadores e números de referência. Colunas desconhecidas, duplicatas e ações órfãs precisam de erro/aviso explícito; nenhuma perda silenciosa.
3. Identificar a pergunta 3 TEXT para este modelo e permitir revisão antes de publicar; a regra específica não deve se tornar um palpite aplicado a qualquer CSV futuro. Outros modelos podem ter exceções diferentes.
4. Criar rascunho editável com confirmação e idempotência, sem alterar modelos publicados existentes. Importação repetida não duplica silenciosamente o mesmo pedido.
5. Perguntas principais obrigatórias são a proposta inicial da prévia e devem aparecer para revisão. A obrigatoriedade das ações NO é requisito confirmado. Categoria/prioridade de não conformidade não são inferíveis do CSV: exigir configuração explícita antes de uma publicação que utilize essas regras; não inventar gravidade nem criar planos automaticamente.

## Cadastros e autorização

- Cliente: nome, situação e vínculos com uma ou mais unidades existentes. Local: cliente, nome e situação. Administração segue o padrão administrativo existente; leituras filtram unidades/setores autorizados antes da paginação.
- Criar uma inspeção exige cliente habilitado para a unidade e local ativo pertencente a esse cliente. Não é permitido selecionar um ID de outro cliente/unidade burlando a interface.
- A unidade/setor organizacional continua sendo a fronteira de acesso. O fluxo guiado deve conservar a escolha de setor quando houver mais de um elegível; não transformar cliente/local em permissão implícita nem tratar local como sinônimo de setor.
- Participantes opcionais registrados por nome, com limites explícitos; não tornam a pessoa responsável, editora ou destinatária de notificação.
- Desativar/renomear cadastros não reescreve o histórico: inspeção preserva a identificação usada na criação, inclusive no PDF. Dados legados continuam consultáveis sem exigir preenchimento retroativo.

## Fluxo proposto

Unidade de negócio → cliente e local → participantes opcionais → tipo de inspeção disponível → preenchimento → conclusão e acompanhamento existentes.

Mudança de unidade limpa cliente/local incompatíveis; mudança de cliente limpa local. Todas as seleções voltam a ser validadas no servidor. Preservar confirmação, recuperação de erro e proteção contra saída sem salvar. Programações precisam transportar o mesmo contexto quando gerarem inspeções.

## Verificação e limites

Testar conversão/pares/acentos, NO sem/com ação, YES/NA, revisão e duplicatas. Testar cadastro, leitura e criação em dois escopos, vínculos cruzados, inativação, nomes históricos, participantes sem direitos e criação por programação. Verificar PDF/contexto, seleção móvel, erros, teclado e WCAG no navegador.

Prévia técnica local em `test-results/epc-import-preview.json`; a simulação do snapshot não publica nem grava cadastros/inspeções. Nenhum registro anterior foi importado nesta análise.
