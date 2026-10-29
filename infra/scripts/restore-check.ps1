[CmdletBinding()]
param([Parameter(Mandatory)][string] $BackupDirectory)
. "$PSScriptRoot/docker-tools.ps1"
$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$manifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne 1) { throw 'Unsupported backup format.' }
foreach ($name in @('database.dump', 'storage.tar', 'storage.sha256')) {
    $actual = (Get-FileHash -LiteralPath (Join-Path $backup $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $manifest.files.$name) { throw "Checksum mismatch: $name" }
}
# Fresh resources only. There is no target/database parameter and no published port.
$identity = 'portal-restore-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$postgres = "$identity-pg"
$volume = "$identity-storage"
$createdContainer = $false
$createdVolume = $false
try {
    Invoke-Docker @('volume', 'create', '--label', "portal.restore=$identity", $volume) | Out-Null
    $createdVolume = $true
    Invoke-Docker @('run', '-d', '--name', $postgres, '--label', "portal.restore=$identity", '--network', 'none', '-e', 'POSTGRES_USER=restore_check', '-e', 'POSTGRES_DB=restore_check', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', $manifest.postgresImage) | Out-Null
    $createdContainer = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker exec $postgres pg_isready -U restore_check -d restore_check *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'Disposable PostgreSQL did not become ready.' }
    Invoke-Docker @('cp', (Join-Path $backup 'database.dump'), "${postgres}:/tmp/database.dump") | Out-Null
    Invoke-Docker @('exec', $postgres, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-U', 'restore_check', '-d', 'restore_check', '/tmp/database.dump') | Out-Null
    $counts = Get-DatabaseCounts $postgres
    $expected = @($manifest.counts.PSObject.Properties)
    if ($counts.Count -ne $expected.Count) { throw 'Restored table set differs.' }
    foreach ($entry in $expected) { if ($counts[$entry.Name] -ne [long]$entry.Value) { throw "Restored count mismatch: $($entry.Name)" } }
    Invoke-Docker @('run', '--rm', '--network', 'none', '--user', '0', '--entrypoint', '/bin/sh', '--mount', "type=volume,src=$volume,dst=/data", '--mount', "type=bind,src=$backup,dst=/backup,readonly", $manifest.minioImage, '-c', 'cd /data && tar -xf /backup/storage.tar && sha256sum -c /backup/storage.sha256 > /tmp/checksums.txt') | Out-Null
    Write-Output "Restore verified: $($counts.Count) tables and all archived storage file checksums. Disposable identity: $identity"
} finally {
    if ($identity -notmatch '^portal-restore-[a-f0-9]{12}$') { throw 'Unsafe cleanup identity.' }
    if ($createdContainer) {
        $record = (Invoke-Docker @('inspect', $postgres) | ConvertFrom-Json)[0]
        if ($record.Config.Labels.'portal.restore' -ne $identity) { throw 'Container ownership mismatch.' }
        Invoke-Docker @('rm', '-fv', $postgres) | Out-Null
    }
    if ($createdVolume) {
        $record = (Invoke-Docker @('volume', 'inspect', $volume) | ConvertFrom-Json)[0]
        if ($record.Labels.'portal.restore' -ne $identity) { throw 'Volume ownership mismatch.' }
        Invoke-Docker @('volume', 'rm', $volume) | Out-Null
    }
}
