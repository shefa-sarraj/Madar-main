param([switch]$ApplyMigrations)
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    if ($ApplyMigrations) {
        $cli = Join-Path $env:APPDATA 'npm/node_modules/supabase/dist/supabase.js'
        if (Test-Path -LiteralPath $cli) { node $cli db push --linked --yes }
        else { supabase db push --linked --yes }
        if ($LASTEXITCODE -ne 0) { throw 'Migration deployment did not complete.' }
    }
    $secret = Read-Host 'Initial Platform Super Admin password' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $env:MADAR_BOOTSTRAP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        node scripts/bootstrap-platform-admin.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Platform bootstrap did not complete.' }
    } finally {
        Remove-Item Env:MADAR_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secret.Dispose()
    }
} finally { Pop-Location }
