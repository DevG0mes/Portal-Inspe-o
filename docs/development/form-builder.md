# Construtor visual

## Rotas e responsabilidades

`/admin/forms` e `/admin/forms/:id` são exclusivos de ADMIN, com verificação no servidor e novamente na API. O catálogo cria modelos e filtra nome/estado/página pela API. O nome administrativo é definido na criação; o título de cada versão é editável no rascunho.

- `features/form-builder/model.ts`: operações imutáveis de conteúdo, IDs estáveis, duplicação e proteção de dependências.
- `draft-session.ts`: um escritor por editor, revisão otimista e reconhecimento por geração local. Mantém o conteúdo mais recente quando uma resposta antiga chega.
- `content-editor.tsx`, `question-editor.tsx`, `predicate-editor.tsx`: composição de campos comuns; seções/perguntas/opções/condições/ocorrências.
- `builder.tsx`: ciclo do rascunho, publicação, arquivamento e recuperação de conflito.
- `version-history.tsx`: histórico paginado e consulta individual de versões, com nome do autor e instante em America/Sao_Paulo.
- `features/form-preview`: respostas de simulação; usa o mesmo motor puro da API.
- `packages/form-engine`: motor existente da etapa 5 extraído sem reescrever regras. A API sempre recalcula e valida seus próprios dados; resultados do navegador não autorizam publicação.

## Edição e persistência

IDs UUID são criados ao inserir itens e preservados durante a edição. Duplicações recebem novos IDs e remapeiam apenas referências internas. IDs de opções são interpretados no contexto da pergunta, pois o contrato permite repetição entre perguntas diferentes.

Ordenação usa botões de subir/descer, acessíveis por teclado e toque. A nova ordem não pode colocar uma pergunta antes de sua dependência. Referências só aparecem para perguntas anteriores. Remoção de pergunta/seção usada fora dela é bloqueada; opções usadas em regras também não podem ser removidas antes do ajuste da regra. Mudanças que descartam conteúdo/configurações pedem confirmação. Limites: 50 seções, 500 perguntas, 100 opções por seleção e 20 condições por pergunta.

Autosave salva o rascunho no servidor após 700 ms sem edição, suspenso durante composição IME. Há no máximo uma gravação em voo. Novas alterações são reconhecidas separadamente, sem serem substituídas pelo snapshot enviado anteriormente. Prévia/publicação/arquivamento aguardam a confirmação da última gravação. “Rascunho salvo” significa confirmação da API. Enter também solicita salvamento; nenhum formulário usa fallback GET.

Falhas conservam o conteúdo e param novas tentativas automáticas; “Tentar salvar novamente” é explícito. Resposta perdida pode resultar em 409 na tentativa seguinte, porque a gravação talvez tenha sido confirmada no banco; não há repetição silenciosa com revisão nova.

Em 409, gravações param, o editor fica somente leitura e confirmações locais são desmontadas. O foco vai para a orientação de conflito. O JSON local fica disponível para copiar; recarregar exige confirmação de descarte. Não há force overwrite nem mesclagem automática. A cópia local vive somente em memória, sem Web Storage; fechar e confirmar o descarte elimina esse trabalho. Fechamento de documento e links são protegidos pelo DirtyGuard comum enquanto há pendências.

## Prévia e publicação

A prévia usa o motor puro compartilhado para atualizar visibilidade, respostas obrigatórias e ocorrências imediatamente. “Conferir na API” avalia o rascunho salvo e a revisão exata no servidor. A simulação não cria inspeção nem persiste respostas. Número zero permanece número, data usa YYYY-MM-DD, seleção usa ID de opção. O controle de data é nativo do navegador/sistema, conforme UX-CONTRACT.

Validação apresenta sumário com links e erros junto aos campos. Publicação repete a validação definitiva no servidor e cria snapshot imutável. Para editar um publicado, criar rascunho da última versão; a anterior permanece disponível. Arquivamento exige confirmação e preserva o histórico. A consulta de uma versão permite simular seu conteúdo sem alterá-lo.

## Verificar

```powershell
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm build
pnpm test:browser
# Rodada focada no construtor, após o build:
pnpm --filter @portal/web test:browser form-builder.spec.ts
```

O executor usa banco temporário e contas fictícias, seguindo `web.md`. Testes cobrem cópia/ordem/referências, autosave/IME/409, falha de transporte, regras IN, confirmação de descarte e SSR; navegador verifica prévia tipada, autor, v1/v2, arquivamento, conflito com modal aberto e acesso negado a outros perfis.
