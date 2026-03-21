param(
    [ValidateSet('build', 'dev')]
    [string]$Command = 'build',

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Join-Path $root 'dofus-helper'
$bundleRoot = Join-Path $projectDir 'src-tauri\target\release\bundle'
$expectedInstallerPrefix = 'Dofus Helper_'

if (-not (Test-Path $projectDir)) {
    throw "Projet Tauri introuvable: $projectDir"
}

function Find-Npm {
    $candidates = @('npm.cmd', 'npm')
    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    throw 'npm introuvable. Installe Node.js puis relance le script.'
}

function Invoke-Step {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$Label
    )

    Write-Host ''
    Write-Host "[$Label]" -ForegroundColor Yellow
    Write-Host ('> ' + $FilePath + ' ' + ($Arguments -join ' ')) -ForegroundColor Cyan

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "L'etape '$Label' a echoue avec le code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Get-ItemCount {
    param(
        [AllowNull()]
        [object]$Value
    )

    return @($Value).Length
}

function Get-FirstItem {
    param(
        [AllowNull()]
        [object]$Value
    )

    return @($Value) | Select-Object -First 1
}

function Copy-InstallersToRoot {
    param(
        [string]$SourceBundleRoot,
        [string]$DestinationRoot
    )

    if (-not (Test-Path $SourceBundleRoot)) {
        throw "Dossier de bundle introuvable: $SourceBundleRoot"
    }

    $installers = @(
        @(Get-ChildItem -Path (Join-Path $SourceBundleRoot 'nsis') -Filter "$expectedInstallerPrefix*.exe" -File -ErrorAction SilentlyContinue) +
        @(Get-ChildItem -Path (Join-Path $SourceBundleRoot 'msi') -Filter "$expectedInstallerPrefix*.msi" -File -ErrorAction SilentlyContinue)
    )

    if ((Get-ItemCount $installers) -eq 0) {
        throw "Aucun installateur trouve dans $SourceBundleRoot"
    }

    @(Get-ChildItem -Path $DestinationRoot -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -like 'dofus-helper_*.exe' -or
        $_.Name -like 'dofus-helper_*.msi' -or
        $_.Name -like "$expectedInstallerPrefix*.exe" -or
        $_.Name -like "$expectedInstallerPrefix*.msi"
    }) | ForEach-Object {
        Remove-Item -Path $_.FullName -Force
    }

    foreach ($installer in $installers) {
        $destination = Join-Path $DestinationRoot $installer.Name
        Copy-Item -Path $installer.FullName -Destination $destination -Force
        Write-Host "Installateur copie: $destination" -ForegroundColor Green
    }
}

$normalizedTauriArgs = @($TauriArgs)
$firstTauriArg = Get-FirstItem $normalizedTauriArgs
if ((Get-ItemCount $normalizedTauriArgs) -gt 0 -and $firstTauriArg -eq '--') {
    $normalizedTauriArgs = @($normalizedTauriArgs | Select-Object -Skip 1)
}

$npm = Find-Npm
$args = @('run', 'tauri', '--', $Command) + $normalizedTauriArgs

Invoke-Step -FilePath $npm -Arguments $args -WorkingDirectory $projectDir -Label "Tauri $Command"

if ($Command -eq 'build' -and -not ($normalizedTauriArgs -contains '--help') -and -not ($normalizedTauriArgs -contains '-h')) {
    Copy-InstallersToRoot -SourceBundleRoot $bundleRoot -DestinationRoot $root
}

Write-Host ''
Write-Host "Commande Tauri '$Command' terminee." -ForegroundColor Green
