[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $ProjectName,
    [Parameter(Mandatory)][string] $ComposeFile,
    [Parameter(Mandatory)][string] $EnvironmentFile,
    [Parameter(Mandatory)][string] $OutputDirectory
)
. "$PSScriptRoot/docker-tools.ps1"
if ($ProjectName -notmatch '^[a-z][a-z0-9-]{2,60}$') { throw 'Invalid compose project name.' }
$compose = @('compose', '--project-name', $ProjectName, '--env-file', (Resolve-Path -LiteralPath $EnvironmentFile).Path, '-f', (Resolve-Path -LiteralPath $ComposeFile).Path)
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'Backup destination must be new; existing files are never overwritten.' }
$postgres = [string](Invoke-Docker ($compose + @('ps', '-q', 'postgres')))
$minio = [string](Invoke-Docker ($compose + @('ps', '-q', 'minio')))
if (!$postgres -or !$minio) { throw 'PostgreSQL and MinIO must be running in the selected project.' }
$storage = (Invoke-Docker @('inspect', $minio) | ConvertFrom-Json)[0]
$volume = @($storage.Mounts | Where-Object { $_.Destination -eq '/data' -and $_.Type -eq 'volume' })[0].Name
if (!$volume) { throw 'MinIO must use a named volume.' }
$running = @(Invoke-Docker ($compose + @('ps', '--services', '--status', 'running')))
$pause = @($running | Where-Object { $_ -in @('api', 'worker', 'web', 'ingress', 'minio', 'redis') })
New-Item -ItemType Directory -Path $destination | Out-Null
$complete = $false
try {
    if ($pause.Count) { Invoke-Docker ($compose + @('stop', '--timeout', '120') + $pause) | Out-Null }
    $counts = Get-DatabaseCounts $postgres
    $dumpCommand = 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl'
    Export-DockerBinary -Arguments @('exec', $postgres, 'sh', '-c', $dumpCommand) -Destination (Join-Path $destination 'database.dump')
    # Quiesced backend files, including MinIO metadata. No live-volume tar.
    Invoke-Docker @('run', '--rm', '--network', 'none', '--user', '0', '--entrypoint', '/bin/sh', '--mount', "type=volume,src=$volume,dst=/data,readonly", '--mount', "type=bind,src=$destination,dst=/backup", $storage.Config.Image, '-c', 'umask 077; cd /data && find . -type f -exec sha256sum {} + > /backup/storage.sha256 && tar -cf /backup/storage.tar .') | Out-Null
    $manifest = [ordered]@{ version = 1; createdAt = [DateTime]::UtcNow.ToString('o'); project = $ProjectName; postgresImage = (Invoke-Docker @('inspect', $postgres) | ConvertFrom-Json)[0].Config.Image; minioImage = $storage.Config.Image; counts = $counts; files = @{} }
    foreach ($name in @('database.dump', 'storage.tar', 'storage.sha256')) { $manifest.files[$name] = (Get-FileHash -LiteralPath (Join-Path $destination $name) -Algorithm SHA256).Hash.ToLowerInvariant() }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding utf8
    $complete = $true
} finally {
    # Start exactly the services that were running; never start an intentionally stopped writer.
    if ($pause.Count) { Invoke-Docker ($compose + @('start') + $pause) | Out-Null }
}
if ($complete) { Write-Output "Backup complete: $destination" }
