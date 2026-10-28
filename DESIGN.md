# Direção visual do portal

## Contexto

Produto operacional interno, em português brasileiro, para colaboradores em inspeções pelo celular e gestores no computador. Priorizar legibilidade, clareza de estado e facilidade de preenchimento. Login e administração usam a mesma identidade operacional.

## Identidade inicial

Referência: ficha de inspeção de campo, com cabeçalho institucional e faixa de identificação lateral. Evitar linguagem de marketing e painéis com dados inventados. Sem fontes externas, garantindo execução na rede interna.

- Títulos: `Bahnschrift`, `Arial Narrow`, sans-serif.
- Texto: `Segoe UI`, Arial, sans-serif.
- Dados e rótulos técnicos: `Consolas`, monospace, somente quando necessários.
- Tema inicial claro; azul institucional para identidade e âmbar para preparação.
- Espaçamento em múltiplos de 4 px, largura máxima de leitura de 960 px, conteúdo em coluna única no celular.
- Foco de teclado visível; texto não deve depender apenas de cor. Não adicionar animações sem necessidade funcional.

## Tokens e propriedade

Modelo B: `packages/ui/src/tokens.css` é a fonte única dos valores de execução. Este documento define os papéis; não mantém uma segunda cópia dos valores. `apps/web/src/app/globals.css` importa os tokens e os aplica ao layout. Componentes futuros devem consumir as mesmas variáveis.

| Papel                | Token          | Consumidor             |
| -------------------- | -------------- | ---------------------- |
| Fundo geral          | `--background` | body                   |
| Superfície           | `--surface`    | ficha de identificação |
| Texto principal      | `--text`       | títulos e corpo        |
| Texto secundário     | `--muted`      | explicações            |
| Identidade e foco    | `--brand`      | cabeçalho, borda, foco |
| Estado de preparação | `--notice`     | rótulo de estado       |
| Divisórias           | `--border`     | cabeçalho e ficha      |

Mapa canônico: estilos globais, layout responsivo e scrollbar pertencem a `globals.css`; tokens e componentes básicos a `@portal/ui`; comportamento em `features/shared`. Consulte `UX-CONTRACT.md` para formulários, tabelas, seleção, notificações e CRUD. Sem biblioteca externa de componentes.

## Aplicação

Barra lateral azul com navegação por perfil e foco âmbar. Menu móvel em fluxo, conteúdo em uma coluna. Tabelas viram fichas no celular, preservando rótulos, status e ações. Dados pessoais longos quebram linha. Sem imagens decorativas, fontes externas ou indicadores fictícios.

## Estados e acessibilidade

Tokens `--danger`/`--danger-soft` representam falha; `--success`/`--success-soft` representam confirmação; rótulos acompanham cores. Campos e botões têm altura mínima de 44px. Diálogos usam modalidade nativa, Escape e restauração de foco. Contraste AA, reduced-motion e forced-colors. `premium-ui.json` registra fontes e comandos de verificação.

## Construtor de fichas

O construtor continua a referência de ficha operacional: seções numeradas e perguntas em cartões com faixa azul, numeradas pela ordem real. A barra de ações informa a situação do rascunho e a revisão confirmada; não fica sobre os campos. Uma única rolagem de documento, com controles quebrando linha no celular. Condições e regras têm agrupamentos/legendas visíveis e fundo de apoio. Prévia usa os mesmos campos e separa respostas de ocorrências simuladas. Conteúdo local de conflito usa textarea somente leitura, altura suficiente, sem redimensionamento e com rolagem. Nenhuma fonte, cor ou biblioteca visual paralela foi adicionada.

## Preenchimento em campo

`features/inspection-runner` mantém a ficha operacional em coluna única. Uma faixa superior mostra perguntas respondidas e confirmação de salvamento; não fica sobre os campos. Seções seguem a ordem da ficha publicada, com campos canônicos compartilhados com a prévia. Conclusões usam leitura por pergunta/resposta e seletor de ciclo. Rascunhos, erros e conflitos têm texto explícito e recuperação no mesmo documento. Sem promessa de operação offline.
