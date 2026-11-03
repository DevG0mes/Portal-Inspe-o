# Padrão de importação de formulários

O arquivo deve ser CSV UTF-8 com exatamente duas colunas, nesta ordem: **Pergunta** e **Tipo**. Cada linha representa um campo. Use vírgula, ponto e vírgula ou tabulação como separador; coloque textos com o separador entre aspas. O limite é 256 KiB e 500 campos.

```csv
Pergunta;Tipo
1. A proteção está instalada?;Escolha
1. Ação Realizada;Texto
2. Descreva o tema abordado.;Texto
```

- **Escolha** cria Sim / Não / Não Aplicável. Cada pergunta de escolha precisa da Ação Realizada com o mesmo número.
- **Texto** cria resposta livre. Ações devem ser Texto e são exibidas/obrigatórias somente se a pergunta correspondente receber Não.
- Uma pergunta principal pode ser Texto, sem ação. Seu tipo é lido do arquivo, inclusive a pergunta 3: não há exceção automática pelo número.
- Não inclua Status, Protocolo, Criado por, Criado nem respostas anteriores. Esses metadados pertencem ao sistema.

Na tela, selecione unidade/tipo de inspeção, nome e regras de ocorrência. As perguntas de texto são identificadas automaticamente e exibidas somente para conferência. Prepare a prévia e revise antes de criar o rascunho. A publicação continua separada.

O botão **Baixar exemplo de Trabalho em Altura** fornece a ficha de vinte campos baseada nas perguntas fornecidas pelo usuário, sem avaliação técnica adicional. Ela contém dez escolhas e dez ações de texto.

Arquivos antigos com perguntas como colunas deixam de ser aceitos pela tela. O adaptador transforma as linhas no contrato interno do conversor já existente; a API mantém sua validação independente de referências, tipos e regras condicionais.
