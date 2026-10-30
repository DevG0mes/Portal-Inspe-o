# Direção visual do portal

## Contexto

Produto operacional interno, em português brasileiro, para colaboradores em inspeções pelo celular e gestores no computador. Priorizar legibilidade, clareza de estado e facilidade de preenchimento. Login e administração usam a mesma identidade operacional.

## Identidade PSI Energy

Referência: logo original PSI Energy fornecido em 30/10/2026, combinado à ficha de inspeção de campo. Laranja de energia e sinalização, grafite da estrutura industrial e superfícies claras de leitura. Evitar linguagem de marketing e painéis com dados inventados. Sem fontes externas, garantindo execução na rede interna. A imagem permanece original, com transparência, proporção e cores preservadas.

- Títulos: `Bahnschrift`, `Arial Narrow`, sans-serif.
- Texto: `Segoe UI`, Arial, sans-serif.
- Dados e rótulos técnicos: `Consolas`, monospace, somente quando necessários.
- Tema claro; grafite no login/navegação, laranja nos botões e faixas de identificação. Texto escuro sobre o botão laranja, laranja escuro para links em branco e laranja claro no grafite mantêm contraste. Cores semânticas de sucesso/falha continuam distintas da marca.
- Espaçamento em múltiplos de 4 px, largura máxima de leitura de 960 px, conteúdo em coluna única no celular.
- Foco de teclado visível; texto não deve depender apenas de cor. Transições curtas de cor/borda/sombra tornam controles suaves, sem animar dados ou deslocar elementos; reduced-motion remove transições.

## Tokens e propriedade

Modelo B: `packages/ui/src/tokens.css` é a fonte única dos valores de execução. Este documento define os papéis; não mantém uma segunda cópia dos valores. `apps/web/src/app/globals.css` importa os tokens e os aplica ao layout. Componentes futuros devem consumir as mesmas variáveis.

| Papel                   | Token                       | Consumidor             |
| ----------------------- | --------------------------- | ---------------------- |
| Fundo geral             | `--background`              | body                   |
| Superfície              | `--surface`                 | ficha de identificação |
| Texto principal         | `--text`                    | títulos e corpo        |
| Texto secundário        | `--muted`                   | explicações            |
| Identidade e foco       | `--brand`                   | cabeçalho, borda, foco |
| Destaque da marca       | `--accent`                  | botão, faixa, seleção  |
| Texto sobre laranja     | `--on-accent`               | botão primário         |
| Base grafite            | `--brand-dark`              | login e navegação      |
| Superfície escura ativa | `--sidebar-hover`           | navegação hover/atual  |
| Texto secundário escuro | `--on-dark-muted`           | login e rodapé lateral |
| Elevação discreta       | `--shadow`, `--shadow-deep` | cartões e login        |
| Estado de preparação    | `--notice`                  | rótulo de estado       |
| Divisórias              | `--border`                  | cabeçalho e ficha      |

Mapa canônico: estilos globais, layout responsivo e scrollbar pertencem a `globals.css`; tokens e componentes básicos a `@portal/ui`; comportamento em `features/shared`. Consulte `UX-CONTRACT.md` para formulários, tabelas, seleção, notificações e CRUD. Sem biblioteca externa de componentes.

## Aplicação

Barra lateral grafite com logo original, navegação por perfil e destaque laranja da página atual. Logo compartilhado em `features/shared/brand-logo.tsx`, arquivo público em `/brand/psi-energy.png` (260×87), sem filtro, recorte ou reconstrução. Login usa a mesma marca, painel branco e foco explícito no acesso. Menu móvel em fluxo, conteúdo em uma coluna. Tabelas viram fichas no celular, preservando rótulos, status e ações. Dados pessoais longos quebram linha. Sem imagens decorativas, fontes externas ou indicadores fictícios.

Rolagem principal pertence ao documento. A navegação lateral de desktop tem rolagem própria somente quando excede a altura disponível, para manter todos os links alcançáveis; no celular volta ao fluxo do documento. Sombras leves e raio compartilhado suavizam superfícies sem criar um segundo conjunto de componentes.

## Estados e acessibilidade

Tokens `--danger`/`--danger-soft` representam falha; `--success`/`--success-soft` representam confirmação; rótulos acompanham cores. Campos e botões têm altura mínima de 44px. Diálogos usam modalidade nativa, Escape e restauração de foco. Contraste AA, reduced-motion e forced-colors. `premium-ui.json` registra fontes e comandos de verificação.

## Construtor de fichas

O construtor continua a referência de ficha operacional: seções numeradas e perguntas em cartões com faixa da identidade, numeradas pela ordem real. A barra de ações informa a situação do rascunho e a revisão confirmada; não fica sobre os campos. Uma única rolagem de documento, com controles quebrando linha no celular. Condições e regras têm agrupamentos/legendas visíveis e fundo de apoio. Prévia usa os mesmos campos e separa respostas de ocorrências simuladas. Conteúdo local de conflito usa textarea somente leitura, altura suficiente, sem redimensionamento e com rolagem. Nenhuma fonte, cor ou biblioteca visual paralela foi adicionada.

## Preenchimento em campo

`features/inspection-runner` mantém a ficha operacional em coluna única. Uma faixa superior mostra perguntas respondidas e confirmação de salvamento; não fica sobre os campos. Seções seguem a ordem da ficha publicada, com campos canônicos compartilhados com a prévia. Conclusões usam leitura por pergunta/resposta e seletor de ciclo. Rascunhos, erros e conflitos têm texto explícito e recuperação no mesmo documento. Sem promessa de operação offline.

## Evidências e observações

Cada pergunta visível agrupa resposta, observação opcional e evidências. Campos de texto multilinha pertencem a `Textarea` compartilhado. O envio usa seletor nativo de arquivo, situação textual e progresso de transferência; nomes longos quebram linha na lista. Registro finalizado e envio pendente são estados distintos. Download temporário é preparado e aberto por ação explícita. Desvinculação usa a confirmação canônica e preserva o histórico. A seleção de arquivo continua copiável enquanto uma falha é resolvida.

## Correções e validação

`features/action-plans` organiza ocorrências pendentes, atribuição e execução da correção. Detalhe em coluna única com origem, prazo, evidências e histórico cronológico paginado. Estado e vencimento têm rótulos separados. Ações dependem das permissões recebidas da API; responsáveis usam os mesmos controles privados de evidência da inspeção. Comentário e edição de atribuição preservam conteúdo independente até o envio explícito. Conflito oferece cópia local e descarte confirmado, seguindo a recuperação existente.

## Central de avisos

`features/notifications` apresenta avisos em lista cronológica paginada, com tipo, data em São Paulo e rótulo de leitura. Divisórias e ações seguem o histórico de planos; não há overlay ou toast novo. Indicador textual junto à navegação informa não lidas. Links indisponíveis têm explicação explícita e não convidam a uma ação sem acesso.

## Visão operacional

`features/dashboard` substitui a ficha de preparação pelos indicadores reais. Mantém os cartões de leitura, tipografia e tokens existentes. Filtros por envio explícito, organização em disclosure e explicação das fórmulas no documento. Evolução usa meter nativo acompanhado dos mesmos números em tabela; distribuições têm tabelas por dimensão. Sem porcentagens decorativas, animações ou gráfico sem equivalente legível. Conteúdo vira coluna única no celular.

## Relatórios

`features/reports` acompanha pedidos em tabela que vira ficha móvel. Situações são textuais, sem percentuais fictícios. Criação usa confirmação existente; integridade fica em disclosure nativo. Download reutiliza a preparação privada comum a evidências. Não há segunda linguagem visual, modal de progresso bloqueante ou dependência de fontes externas. PDF mantém a identidade azul e leitura em A4 com fontes incorporadas; Excel separa resumo, evolução, ocorrências, planos e contexto dos filtros.

## Importação e identificação operacional

A importação em `features/form-builder/import-form.tsx` usa arquivo nativo, prévia textual e confirmação comum antes de criar rascunho. Escolha de prioridade explícita; publicação no construtor. `features/shared/unit-bindings.tsx` estende RemotePicker para vínculos múltiplos sem outra linguagem visual. Clientes e locais usam ResourceList/ResourceForm existentes, com revisão e inativação.

A entrada por unidade usa cartões com links e busca paginada. Tipos são botões com estado selecionado textual e aria-pressed; indisponíveis têm explicação junto ao rótulo. Identificação e participantes pertencem a `identification-fields.tsx`, compartilhado com programação. `identification-summary.tsx` mantém a identificação histórica legível no detalhe. Layout usa tokens PSI, coluna única móvel e controles nativos; nenhuma imagem, fonte ou animação nova.
