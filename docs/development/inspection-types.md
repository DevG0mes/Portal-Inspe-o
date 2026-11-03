# Tipos de inspeção por unidade

O cadastro antes chamado Setores passa a representar Tipos de inspeção. Exemplos: EPC → Trabalho em Altura, Espaço Confinado; SPCS pode ter outros tipos. Cada tipo pertence a uma unidade. IDs, permissões e rotas técnicas `organization/sectors` permanecem para preservar registros existentes.

## Uso

1. Cadastre a unidade e seus tipos em **Tipos de inspeção**.
2. Importe a ficha selecionando unidade e tipo, ou selecione-os ao criar um novo modelo manual.
3. Para modelos existentes, use **Formulários → Vincular tipo**. O catálogo mostra o tipo associado. Programações existentes impedem a troca de vínculo do modelo; nesse caso crie um modelo separado.
4. Na inspeção ou programação, selecione unidade, tipo e formulário publicado compatível. Clientes e locais continuam identificando a empresa e o lugar inspecionado.

Uma ficha pertence a um tipo de uma unidade. Para outra unidade/tipo, crie outro modelo. Formulários antigos sem vínculo permanecem disponíveis no escopo anterior até associação explícita; nomes de registros existentes não são convertidos por inferência. O endpoint antigo de categorias fixas é mantido apenas para compatibilidade e não controla mais a seleção das telas.

Na importação, deixe as exceções de texto vazias se todas as perguntas principais forem escolha. **Trabalho em Altura** tem dez perguntas de escolha e dez ações de texto: a pergunta 3 é escolha. A exceção de texto 3 aplica-se apenas à ficha EPC geral. Ações continuam condicionais e obrigatórias para Não. Cabeçalhos de protocolo, responsável e data são metadados, sem importação de respostas históricas.

## Exclusão de formulários

Somente administradores podem usar **Excluir**. A confirmação mostra o nome e o efeito. Rascunho nunca publicado e sem programação é apagado fisicamente, removendo seus vínculos auxiliares. Modelos publicados/ligados a programação são removidos do catálogo por exclusão lógica; versões, inspeções, respostas e PDFs permanecem. O nome fica livre para criar um novo modelo. Nenhuma inspeção de teste é apagada automaticamente.

Após a remoção, novas inspeções e novas materializações não podem utilizar o modelo. Programações inválidas são suspensas pela validação existente. Inspeções já iniciadas e consultas históricas permanecem acessíveis segundo as permissões atuais. Publicação, exclusão e execução serializam no formulário; revisão desatualizada devolve conflito. A auditoria registra o responsável e se a exclusão foi física ou lógica.

Migração `202611030001`: vínculo `inspection_type_id` e marca `deleted_at`. Não renomeia tabelas nem apaga dados. Rollback recusa perda de vínculos/remoções existentes.
