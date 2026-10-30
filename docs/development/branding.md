# Identidade PSI Energy — 30/10/2026

Pedido: harmonizar o portal com o logo original, personalizar cores e inserir a marca nas telas. A direção segue o material fornecido: destaque laranja, navegação grafite e área de trabalho clara. Foi escolhida a composição clara para preservar leitura de tabelas e inspeções em campo; um tema inteiramente escuro ou fundos inteiramente laranja prejudicariam essa prioridade. Sem alteração de regras, permissões ou operações.

## Implementação e propriedade

- Valores canônicos em `packages/ui/src/tokens.css`, aplicados pelo CSS global. Botões laranja com texto grafite; links em laranja escuro e página atual em laranja claro sobre grafite. Sucesso e falha mantêm seus significados.
- Logo original copiado para `apps/web/public/brand/psi-energy.png`, SHA-256 `4c016308500fbb0e27a33bc04927c096d535a252ad9bda3204fcfe8611b4425f`. Arquivo de origem fornecido pelo usuário: `LOGO+HOME-261w.png`. Nenhuma alteração nos pixels, transparência ou proporção 260×87.
- `BrandLogo` compartilha dimensões, texto alternativo e asset entre login e navegação; Next Image sem recompressão, sem fonte ou serviço externo. Docker da interface inclui `public` para servir a marca também em standalone.
- Cabeçalho, cartões, tabelas, formulários, foco e estados usam os componentes e tokens existentes. Transições de 160 ms apenas em cor/borda/sombra; reduced-motion desativa. Sidebar desktop permite alcançar navegação longa; menu móvel permanece em fluxo.

## Verificação

Teste inicial de branding falhou nos dois tamanhos pela ausência do logo. `branding.spec.ts` verifica carregamento real da imagem, login, seleção da navegação, dashboard, usuários, contraste WCAG, largura móvel e reduced-motion. Capturas de login, painel e administração são geradas em `test-results/psi-*.png` para conferência visual. Build, lint, tipos, formatação, 76 testes unitários e 46 cenários de navegador aprovados; auditoria premium estrita e revisão independente sem apontamentos bloqueantes. Docker web construído e asset original conferido na imagem. Evidências finais são registradas no progresso.
