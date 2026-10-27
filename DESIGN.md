# Direção visual do portal

## Contexto

Produto operacional interno, em português brasileiro, para colaboradores em inspeções pelo celular e gestores no computador. Priorizar legibilidade, clareza de estado e facilidade de preenchimento. A primeira página apenas identifica um ambiente ainda em preparação.

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

Mapa canônico atual: estilos globais e scrollbar pertencem a `globals.css`; tokens a `@portal/ui`. Tabelas, formulários, seleção, notificações e CRUD ainda não existem e exigirão contratos antes da implementação. Nenhuma biblioteca de componentes ou preferência de marca foi fornecida.
