# Interface e fronteira de sessão

## Executar

Com o Compose saudável, migrações aplicadas e primeiro administrador criado conforme `authentication.md`:

```powershell
pnpm build
pnpm --filter @portal/api start
# Em outro terminal:
pnpm --filter @portal/web start
```

Abra `http://127.0.0.1:3000/login`. Os scripts carregam `.env` da raiz. Desenvolvimento: `pnpm dev`. `APP_ORIGIN` deve corresponder exatamente à origem do navegador; `API_INTERNAL_URL` é somente do servidor, com padrão `http://127.0.0.1:3001`. Não usar prefixo NEXT_PUBLIC. Não existe senha padrão nem recuperação por e-mail nesta etapa.

## Responsabilidades

- `app/(auth)`: entrada e troca de senha. Sessões com troca pendente não acessam páginas protegidas; a tela oferece logout.
- `app/(portal)`: shell e páginas protegidas no servidor. Cada página administrativa exige ADMIN; a API repete a autorização.
- `features/auth`: formulários e ações da própria sessão.
- `features/admin`: listas e formulários comuns para usuários/unidades/setores; vínculos usam fluxo próprio. A configuração contém as diferenças de domínio, sem duplicar CRUD.
- `features/shared`: carregamento cancelável, paginação, seleção remota paginada, confirmação e proteção de edição.
- `packages/ui`: tokens e elementos visuais sem dependência de Next; controles client ficam nas features.
- `lib`: transporte cliente, transporte servidor e sessão por requisição. Contratos públicos vêm de `@portal/contracts`.

## BFF e cookies

O navegador chama `/api` na origem do frontend. O catchall Next tem upstream fixo e permite somente auth/users/organization/forms, com segmentos validados, JSON até 2 MiB, timeout de 10 segundos e sem seguir redirects. Encaminha apenas o cookie de sessão validado e os cabeçalhos necessários. Mutações exigem Origin exata e rejeitam Sec-Fetch-Site cross-site. A API mantém autenticação, autorização, auditoria e transações.

Na API, `portal_session` mantém Path=/api. No frontend, o BFF mapeia Set-Cookie para Path=/, preservando HttpOnly, SameSite e Secure. Isso permite SSR sem expor o segredo ao JavaScript. Na emissão/remoção também expira a versão antiga de Path=/api, evitando duplicidade. A leitura rejeita cookies duplicados/malformados. Nenhum token é persistido em Web Storage ou registrado em logs.

## Comportamentos deliberados

Consulte `DESIGN.md` e `UX-CONTRACT.md`. Filtros não sensíveis e página retornam do formulário por whitelist; destinos arbitrários não são aceitos. Busca por nome/e-mail fica em memória e é limpa ao trocar de documento. Erros não repetem mutações automaticamente. Sessão expirada oferece reautenticação em outra aba para conservar a edição atual.

Entradas de criação/edição/redefinição pela lista usam navegação por documento: o Voltar pode acionar beforeunload com alterações pendentes. Links clicados dentro da edição usam confirmação do aplicativo. Senhas não entram na URL. Campos não alterados não são reenviados no PATCH, evitando restaurar permissões antigas ao salvar um nome. Alteração explícita do mesmo campo por dois administradores ainda segue a regra de última gravação da API.

Dashboard mostra contagens reais no escopo da API. Construtor visual, inspeções e planos de ação pertencem às próximas etapas e não têm links falsos.

## Verificação

`pnpm test:browser` exige `pnpm build` e Compose saudável. Cria e migra banco local `portal_test_<uuid>`, gera senhas aleatórias para contas fictícias e inicia API3101/web3100. Ao terminar encerra seus processos e remove seu banco temporário. Nunca usa contas do portal. Portas 3100/3101 precisam estar livres. Usa Edge instalado no Windows; em outros ambientes, instale Chromium com `pnpm --filter @portal/web exec playwright install chromium`. Capturas/trace ficam em `test-results/`, ignorado pelo Git. Axe e largura móvel são verificados nos mesmos fluxos. O auditor premium verifica contratos estáticos; não substitui o navegador.
