# Tipos por unidade e limpeza de formulários

## Objetivo

Unificar o cadastro exibido como Setor com Tipo de Inspeção. Cada unidade terá seus próprios tipos cadastráveis (EPC → Trabalho em Altura, por exemplo). Cliente e local continuam independentes desse cadastro. Não excluir registros existentes durante a migração.

## Abordagem proposta

Reaproveitar a entidade e os IDs de Setor para tipos por unidade, preservando vínculos de usuários, inspeções e programações. Atualizar rótulos e adicionar vínculo explícito entre formulário e tipo. Substituir o menu fixo de cinco tipos por consulta aos tipos ativos da unidade. Apenas renomear os rótulos deixaria a duplicidade atual; recriar o cadastro perderia continuidade do histórico.

Criação manual e importação devem permitir selecionar unidade/tipo. Seletores de formulários e validações de API devem respeitar esses vínculos na inspeção e na programação. Modelos antigos sem vínculo precisam de associação administrativa explícita; não inferir tipos pelo nome. Histórico permanece consultável.

## Exclusão

Administradores podem excluir fisicamente rascunhos nunca publicados e sem uso, com confirmação contendo o nome e revisão otimista. Formulários publicados têm versões protegidas contra exclusão no banco. Proposta: permitir removê-los do catálogo por exclusão lógica, preservando versões, inspeções, programações e PDFs. A ação não apaga inspeções nem limpa tabelas de respostas. Auditar ambas as operações e impedir novas utilizações de modelos removidos.

## Importação Trabalho em Altura

O exemplo fornecido tem dez perguntas de escolha e dez ações condicionais de texto. A pergunta 3 é escolha neste modelo; a exceção de texto no modelo EPC geral não deve ser aplicada automaticamente. Protocolo, responsável e data são metadados do sistema.

## Verificação prevista

Testes de isolamento entre unidades/tipos, disponibilidade de modelos, compatibilidade histórica e permissões; exclusão concorrente com publicação/criação de inspeção; confirmação e navegação desktop/celular. Preservar alterações já presentes de filtros e inicialização local.

## Decisão aprovada

Usuário aprovou seguir com a limpeza preservando históricos por exclusão lógica dos publicados. Inspeções de teste não são apagadas por esse fluxo.
