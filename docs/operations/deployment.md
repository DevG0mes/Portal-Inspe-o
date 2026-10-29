# Implantação interna

O Compose de produção é separado do desenvolvimento. Ele cria PostgreSQL, Redis, MinIO, migração única, API, worker, Next.js standalone e ingresso HTTPS. Executar o ensaio local não publica o portal na rede da empresa. O administrador do servidor deve definir DNS, certificado confiável, credenciais, firewall e destino protegido dos backups antes da instalação real.

## Preparação

1. Usar Docker Engine/Compose v2 em servidor Linux com espaço para banco, evidências, relatórios e backups. Fotos e relatórios têm retenção indefinida; monitorar crescimento e espaço livre. Começar com 4 vCPU/8 GB é uma hipótese de dimensionamento, não uma capacidade homologada para 1.000 usuários simultâneos.
2. Copiar `infra/production.env.example` para arquivo protegido fora do Git. Substituir todos os marcadores. `DATABASE_URL` usa host `postgres` e senha codificada para URL; `POSTGRES_PASSWORD` recebe a mesma senha original. Não imprimir `docker compose config` resolvido: contém credenciais. Usar `config --quiet`.
3. Apontar dois nomes DNS ao servidor: `PORTAL_HOST` para o portal e `FILES_HOST` para downloads. `APP_ORIGIN` e `MINIO_PUBLIC_URL` devem ser origens HTTPS sem caminhos, credenciais ou query; incluir a porta se não for 443. MinIO permanece privado na rede Docker; URLs de download são assinadas com o nome público, por 60 segundos, na região `us-east-1`.
4. Disponibilizar `fullchain.pem` e `privkey.pem` em `TLS_DIRECTORY`. O certificado deve cobrir os dois nomes; a chave precisa ser legível pelo UID 101 do ingresso, sem ficar publicamente acessível. Usar autoridade confiável pelos computadores da empresa. Não desativar verificação TLS.
5. `HTTPS_BIND` inicia em loopback. Definir o IP interno aprovado do servidor quando for publicar. Publicar somente HTTPS; banco, Redis, console/S3 do MinIO, API e worker não expõem portas do host. Não colocar proxy adicional na frente sem revisar limites de IP: o ingresso considera o peer real e ignora cabeçalhos de encaminhamento fornecidos pelo cliente.

## Construção e início

Na raiz, em PowerShell 7, ajustar os dois caminhos/valores:

```powershell
$configPath = '/srv/portal/production.env'
$composeArgs = @('compose', '-p', 'portal-production', '--env-file', $configPath, '-f', 'infra/compose.production.yaml')
docker @composeArgs config --quiet
# Só prossiga se o código de saída for zero.
docker @composeArgs build
docker @composeArgs up -d --wait --wait-timeout 180
docker @composeArgs ps
```

Fixar `RELEASE_TAG` no commit entregue, registrar os IDs/digests das imagens construídas e não reutilizar a tag para outro conteúdo. Bases são fixadas por digest. API e worker usam instalação de dependências de produção; a interface usa standalone. Fontes Noto e licença acompanham o worker. Aplicações e ingresso executam sem root, com filesystem somente leitura e diretórios temporários explícitos. PostgreSQL usa seu entrypoint oficial para inicializar o volume e depois assume o usuário postgres.

O serviço `migrate` termina com sucesso antes de iniciar a API. A API nunca altera o schema no startup. Fazer uma operação de implantação por vez. **Em atualizações, parar explicitamente os escritores antigos antes do backup e mantê-los parados até a migração nova concluir.** `depends_on` não para containers antigos. O script de backup retoma somente os serviços que encontrou ativos, portanto não retoma esses escritores se a parada for anterior à captura:

```powershell
docker @composeArgs build
if ($LASTEXITCODE -ne 0) { throw 'Construção falhou; não iniciar atualização.' }
docker @composeArgs stop --timeout 120 ingress web api worker
if ($LASTEXITCODE -ne 0) { throw 'Parada falhou; investigar antes de migrar.' }
./infra/scripts/backup.ps1 -ProjectName portal-production -ComposeFile infra/compose.production.yaml -EnvironmentFile $configPath -OutputDirectory /backups/portal/ANTES-DESTA-ATUALIZACAO
if (!$?) { throw 'Backup falhou; manter escritores parados.' }
docker @composeArgs run --rm --no-deps migrate
if ($LASTEXITCODE -ne 0) { throw 'Migração falhou; manter escritores parados.' }
docker @composeArgs up -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Atualização sem readiness; investigar.' }
```

Usar o mesmo projeto/volumes e destino novo de backup a cada atualização. Não executar `down -v`. Se a migração falhar, preservar banco e logs e seguir o procedimento de incidente, sem reiniciar a imagem antiga nem tentar downgrade automático.

## Primeiro administrador

Sem usuários existentes, executar o comando compilado no container da API, passando `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` por ambiente temporário protegido. Usar `docker @composeArgs exec -T -e INITIAL_ADMIN_EMAIL -e INITIAL_ADMIN_PASSWORD api node dist/identity/create-admin.js`; os valores vêm do ambiente do processo chamador. Remover as variáveis depois. O bootstrap recusa banco já provisionado e exige troca no primeiro login. Nunca guardar essa senha no Git, em comandos com valor literal ou em exemplos públicos.

## Conferência operacional

- `api`: readiness consulta PostgreSQL/Redis/MinIO com timeout; `/api/health/live` é independente. Consultar internamente pelo container, pois health da API não é publicado pelo BFF.
- `worker`: heartbeat atômico em `/tmp/worker-health.json`; checa execução, Redis, banco e MinIO. Health falha após 60 s sem atualização. `node dist/health/check.js` retorna código apropriado. Estado unhealthy exige alerta/investigação; Docker não reinicia automaticamente só por unhealthy.
- `web`: verifica login no servidor standalone; `ingress`: verifica o listener TLS. Login real, inspeção e download devem ser homologados pelo domínio confiável.
- Logs HTTP JSON incluem requestId gerado no servidor, método, status e duração. Não incluem URL/query, cookie, corpo, senha, token ou exceção de infraestrutura. O BFF devolve o requestId para suporte. Logs Docker têm rotação 10 MB × 5 por serviço; guardar logs de incidente em local protegido.
- Login/troca de senha: ingresso limita cada IP a 10/min, burst 5, resposta 429. API limita o peer de transporte a 120/min como defesa adicional; bloqueio por conta após falhas continua no domínio. A topologia é um único ingresso/API: replicação exige centralização desses limites.
- JSON da API/BFF: 2 MiB; binário: 25 MiB absolutos, com política efetiva de evidência de 10 MiB padrão. Limites do worker/relatórios estão em `docs/development/reports.md`.

## Ensaio e limites

`production-smoke.mjs` gera dados somente no projeto descartável `portal-stage14`, usando certificado de teste explicitamente confiado e dois nomes `.test`. Verifica BFF HTTPS, migração, bootstrap/troca, formulário, conclusão, worker, PDF/Excel, assinatura pública e bloqueio anônimo. Não é comando de homologação para o banco real.

O caminho completo com programação, foto e aprovação e a fumaça concorrente por escopo estão em `apps/web/e2e/critical-path.spec.ts` e `tests/load/smoke.ts`, executados pelo runner isolado de `pnpm test:browser`. A fumaça usa 10 leituras simultâneas × 3 rodadas por escopo, p95 até 5 s; não comprova capacidade de produção. Celular automatizado é viewport/touch no navegador; aparelho físico e infraestrutura final exigem homologação local.
