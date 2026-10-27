# Identidade, autenticação e sessões

## Estado

A tarefa 3 implementa a API de autenticação local. A tela de login pertence à tarefa 6. Não há cadastro público nem endpoint anônimo de redefinição de senha. As APIs de administração de usuários e vínculos foram adicionadas na tarefa 4; veja [organização e escopos](organization.md).

## Preparação

```powershell
pnpm --filter @portal/api db:migrate
```

A segunda migração cria `portal_user` e `auth_session`. Usuários possuem perfil fixo (`COLLABORATOR`, `MANAGER`, `ADMIN`), estado ativo, indicador de troca obrigatória e controles de falhas de login. Sessões possuem vínculo com usuário, hash do identificador, vencimento e revogação.

## Primeiro administrador

O comando local abaixo só funciona se não houver usuários no banco. Não altera contas existentes. Um lock transacional impede que execuções concorrentes criem múltiplos administradores iniciais.

No PowerShell 7, para não registrar a senha na linha de comando:

```powershell
$env:INITIAL_ADMIN_EMAIL = Read-Host 'E-mail do administrador'
$env:INITIAL_ADMIN_PASSWORD = Read-Host 'Senha temporária (15 a 128 caracteres)' -MaskInput
try {
  pnpm --filter @portal/api admin:create
} finally {
  Remove-Item Env:INITIAL_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:INITIAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

Não salvar essas variáveis em arquivos versionados. O comando imprime somente o identificador da conta criada. O primeiro acesso exige troca da senha temporária. Não foram criadas credenciais padrão nem um administrador real durante o desenvolvimento.

## Contratos HTTP

| Método e rota                    | Entrada                                  | Resultado                                          |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| `POST /api/auth/login`           | `email`, `password`                      | Principal autenticado e cookie novo                |
| `GET /api/auth/me`               | Cookie                                   | Principal atual                                    |
| `POST /api/auth/logout`          | Cookie                                   | 204, sessão revogada e cookie removido             |
| `POST /api/auth/logout-all`      | Cookie                                   | 204, todas as sessões do próprio usuário revogadas |
| `POST /api/auth/change-password` | Cookie, `currentPassword`, `newPassword` | Principal e cookie de uma sessão nova              |

O principal contém somente `userId`, `role`, `sessionId` e `mustChangePassword`. O identificador secreto da sessão é transmitido apenas pelo cookie; hashes de credencial não são retornados em DTOs.

Requisições POST desse módulo exigem `Content-Type: application/json`, inclusive logout. Campos inesperados são rejeitados nos DTOs de login e troca de senha. O e-mail é normalizado; senhas preservam espaços e não são truncadas.

O guard global exige sessão em todas as rotas não marcadas explicitamente como públicas. Somente saúde e login são públicos. Se a troca de senha estiver pendente, o usuário pode apenas consultar `/auth/me`, trocar a senha ou sair. O perfil e o estado ativo são consultados no banco a cada requisição.

## Política inicial do MVP

- Argon2id com salt aleatório, memória de 19 MiB, 2 iterações e paralelismo 1, conforme o mínimo de referência da [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Novas senhas entre 15 e 128 caracteres, sem exigências artificiais de composição.
- Após 5 falhas, bloqueio de novos logins por 15 minutos. Tentativas simultâneas são serializadas no banco. Tentativas durante o bloqueio não o prolongam.
- Credenciais inválidas, usuário desconhecido, conta inativa e bloqueio retornam a mesma resposta 401. Contas desconhecidas também executam verificação Argon2id.
- Sessão opaca com 32 bytes aleatórios; apenas SHA-256 do identificador é persistido. Validade absoluta de 8 horas, sem renovação silenciosa ilimitada.
- Login com um cookie anterior revoga aquela sessão e emite outra. Troca de senha revoga todas as sessões anteriores e cria uma nova. Logout geral revoga todas as sessões do próprio usuário.
- A redefinição administrativa exige administrador ativo com troca de senha concluída, revoga sessões e força nova troca no próximo login. Está disponível em `POST /api/users/:id/reset-password`, protegido pelo perfil de administrador; não há endpoint anônimo de reset.

Os tempos e limites estão centralizados em `apps/api/src/auth/auth.policy.ts`. São decisões técnicas iniciais para o MVP e devem ser reavaliados com a política corporativa na implantação.

## Cookies, origem e ambiente

O cookie `portal_session` é host-only, `HttpOnly`, `SameSite=Strict`, com caminho `/api`. Em produção recebe `Secure`; `NODE_ENV=production` também exige `APP_ORIGIN` HTTPS. Cookies locais de desenvolvimento usam HTTP em loopback.

`APP_ORIGIN` define a única origem permitida para o frontend (padrão `http://127.0.0.1:3000`). A API rejeita operações de alteração com outra origem ou Fetch Metadata cross-site. JSON obrigatório impede submissões simples de formulário no login. Clientes sem Origin, como scripts operacionais, continuam aceitos. Em produção, servir frontend e API no mesmo site, por HTTPS; `SameSite=Strict` não atende frontends hospedados em sites independentes.

Respostas da API usam `Cache-Control: no-store`. Um `X-Request-Id` gerado pelo servidor acompanha cada requisição e seus registros de auditoria. Login, falhas, logout, revogações, troca e redefinição de senha são auditados sem armazenar credenciais.

## Verificação

`pnpm test:e2e` agora também exige PostgreSQL local saudável. A suíte de autenticação usa API real, Argon2id real e um banco temporário próprio. Os testes cobrem cookies, CSRF, bloqueio e concorrência, expiração, usuário inativo, rotação, troca obrigatória, revogação, auditoria e bootstrap único.

`pnpm test:integration` continua verificando o schema completo e o ciclo de todas as migrações num banco temporário. Nenhum teste faz down de migrações no banco do portal.
