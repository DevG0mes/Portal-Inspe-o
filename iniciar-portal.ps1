$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Prefer the compatible runtime already installed by Codex on this computer.
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeBin = Join-Path $runtime 'node\bin'
$pnpmBin = Join-Path $runtime 'bin\fallback'
if (Test-Path (Join-Path $nodeBin 'node.exe')) {
    $env:Path = "$nodeBin;$pnpmBin;$env:Path"
}
if (!(Get-Command node -ErrorAction SilentlyContinue) -or !(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw 'Node 24 e pnpm 11.25.0 precisam estar instalados e disponíveis no PATH.'
}
if ((node --version) -notmatch '^v24\.') { throw 'Este projeto requer Node 24.' }
if (!(Test-Path '.env')) { throw 'Arquivo .env ausente. Configure-o antes de iniciar o portal.' }

# The Compose file is in infra; its environment file is at the project root.
docker compose --env-file .env -f infra/compose.yaml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar os serviços Docker.' }
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' }
pnpm --filter @portal/api db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Falha ao aplicar migrações.' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o portal.' }
Write-Host 'Portal: http://127.0.0.1:3000 — Ctrl+C para encerrar.'
pnpm dev
