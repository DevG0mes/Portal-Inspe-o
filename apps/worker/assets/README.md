# Fontes dos relatórios

Noto Sans Regular/Bold e Noto Sans Math, incorporadas pelo PDFKit. Arquivos completos incluem português e grego; segmentos matemáticos usam Noto Sans Math para preservar símbolos como ≥ e ≤. Não há download de fonte em execução.

Origem: [Noto Fonts](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans), obtidos em 29/10/2026. Licença SIL Open Font License 1.1 em `OFL.txt`. Os binários versionados e os hashes abaixo fixam o conteúdo independentemente de alterações na origem.

| Arquivo                  | SHA-256                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| NotoSans-Regular.ttf     | b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5 |
| NotoSans-Bold.ttf        | c976e4b1b99edc88775377fcc21692ca4bfa46b6d6ca6522bfda505b28ff9d6a |
| NotoSansMath-Regular.ttf | 80b61fd613d3519197e64fff6f7e71fdc7f3e6526440ea4115b554ef7fd59af7 |

O empacotamento deve preservar `apps/worker/assets` junto de `apps/worker/dist`. O renderer resolve os arquivos relativamente ao módulo, tanto em desenvolvimento quanto compilado.
