Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Docker([string[]] $Arguments) {
    $result = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed (exit $LASTEXITCODE)." }
    return $result
}

# PowerShell text pipelines must never carry pg_dump's binary archive.
function Export-DockerBinary([string[]] $Arguments, [string] $Destination) {
    $start = [Diagnostics.ProcessStartInfo]::new('docker')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    $errors = $process.StandardError.ReadToEndAsync()
    $output = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew)
    try { $process.StandardOutput.BaseStream.CopyTo($output) } finally { $output.Dispose() }
    $process.WaitForExit()
    $null = $errors.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) { throw 'Database archive export failed.' }
    $process.Dispose()
}

function Get-DatabaseCounts([string] $Container) {
    $tables = Invoke-Docker @('exec', $Container, 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select tablename from pg_tables where schemaname=''public'' order by tablename"')
    $counts = [ordered]@{}
    foreach ($table in $tables) {
        if ($table -notmatch '^[a-z_][a-z0-9_]*$') { throw 'Unexpected table name.' }
        $command = 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ''select count(*) from "' + $table + '"'''
        $counts[$table] = [long](Invoke-Docker @('exec', $Container, 'sh', '-c', $command))
    }
    return $counts
}
