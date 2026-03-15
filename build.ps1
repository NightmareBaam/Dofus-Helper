param(
    [string]$PythonExe,
    [string]$InnoCompiler,
    [switch]$SkipExe,
    [switch]$SkipInstaller,
    [switch]$KillRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$appName = 'Dofus Helper'
$exeBaseName = 'DofusHelper'
$exeName = "$exeBaseName.exe"
$installerName = 'DofusHelper-Setup.exe'
$sourceFile = Join-Path $root 'DofusHelper_main.py'
$iconFile = Join-Path $root 'build_icon.ico'
$issFile = Join-Path $root 'DofusHelper.iss'
$assetsDir = Join-Path $root 'assets'
$staticDir = Join-Path $root 'src\ui\view\static'
$catalogDir = Join-Path $root 'bdd_items'
$buildRoot = Join-Path $root 'build'
$pyInstallerWorkDir = Join-Path $buildRoot 'pyinstaller'
$pyInstallerDistDir = Join-Path $buildRoot 'dist'
$pyInstallerSpecDir = Join-Path $buildRoot 'spec'
$installerOutputDir = Join-Path $buildRoot 'installer'
$buildDistExe = Join-Path $pyInstallerDistDir $exeName
$buildInstaller = Join-Path $installerOutputDir $installerName
$finalInstaller = Join-Path $root $installerName
$legacyRootExe = Join-Path $root $exeName

function Find-Python {
    param([string]$Preferred)

    if ($Preferred) {
        $cmd = Get-Command $Preferred -ErrorAction SilentlyContinue
        if ($cmd) {
            return @{ FilePath = $cmd.Source; PrefixArgs = @() }
        }
        if (Test-Path $Preferred) {
            return @{ FilePath = $Preferred; PrefixArgs = @() }
        }
        throw "Python introuvable avec -PythonExe '$Preferred'."
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return @{ FilePath = $pythonCmd.Source; PrefixArgs = @() }
    }

    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        return @{ FilePath = $pyCmd.Source; PrefixArgs = @('-3') }
    }

    throw "Python introuvable. Installe Python ou passe -PythonExe 'python' ou le chemin complet vers python.exe."
}

function Find-InnoCompiler {
    param([string]$Preferred)

    $candidates = @()
    if ($Preferred) { $candidates += $Preferred }
    if ($env:INNO_SETUP_COMPILER) { $candidates += $env:INNO_SETUP_COMPILER }
    $candidates += @(
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe'
    )

    foreach ($candidate in $candidates) {
        if (-not $candidate) { continue }
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
        if (Test-Path $candidate) { return $candidate }
    }

    throw "ISCC.exe introuvable. Installe Inno Setup 6 ou passe -InnoCompiler 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'."
}

function Invoke-Step {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$Label
    )

    Write-Host ''
    Write-Host "[$Label]" -ForegroundColor Yellow
    Write-Host ('> ' + $FilePath + ' ' + ($Arguments -join ' ')) -ForegroundColor Cyan
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "L'étape '$Label' a échoué avec le code $LASTEXITCODE."
    }
}

function Get-RunningAppProcesses {
    param([string]$ExePath)

    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try {
            $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -eq $ExePath)
        }
        catch {
            $false
        }
    }
}

function Ensure-BuildTargetWritable {
    param(
        [string]$ExePath,
        [switch]$TerminateRunning
    )

    $running = @(Get-RunningAppProcesses -ExePath $ExePath)
    if ($running.Count -gt 0) {
        $ids = ($running | ForEach-Object { $_.Id }) -join ', '
        if (-not $TerminateRunning) {
            throw "Le fichier est en cours d'utilisation (PID: $ids). Ferme l'application ou relance avec -KillRunning."
        }
        foreach ($proc in $running) {
            Stop-Process -Id $proc.Id -Force
        }
        Start-Sleep -Milliseconds 500
    }

    if (Test-Path $ExePath) {
        Remove-Item $ExePath -Force
    }
}

foreach ($path in @($sourceFile, $iconFile, $issFile, $assetsDir, $staticDir, $catalogDir)) {
    if (-not (Test-Path $path)) {
        throw "Fichier introuvable: $path"
    }
}

New-Item -ItemType Directory -Force -Path $buildRoot, $pyInstallerWorkDir, $pyInstallerDistDir, $pyInstallerSpecDir, $installerOutputDir | Out-Null
Ensure-BuildTargetWritable -ExePath $legacyRootExe -TerminateRunning:$KillRunning
Ensure-BuildTargetWritable -ExePath $finalInstaller -TerminateRunning:$KillRunning

if (-not $SkipExe) {
    $python = Find-Python -Preferred $PythonExe
    if (Test-Path $buildDistExe) {
        Remove-Item $buildDistExe -Force
    }

    $pyInstallerArgs = @()
    $pyInstallerArgs += $python.PrefixArgs
    $pyInstallerArgs += @(
        '-m', 'PyInstaller',
        '--noconfirm',
        '--clean',
        '--onefile',
        '--windowed',
        '--distpath', $pyInstallerDistDir,
        '--workpath', $pyInstallerWorkDir,
        '--specpath', $pyInstallerSpecDir,
        '--name', $exeBaseName,
        '--icon', $iconFile,
        '--add-data', "$assetsDir;assets",
        '--add-data', "$staticDir;src\ui\view\static",
        '--add-data', "$catalogDir;bdd_items",
        $sourceFile
    )

    Invoke-Step -FilePath $python.FilePath -Arguments $pyInstallerArgs -Label 'PyInstaller'

    if (-not (Test-Path $buildDistExe)) {
        throw "Build PyInstaller terminé mais exécutable introuvable: $buildDistExe"
    }

    Write-Host "Exécutable temporaire généré: $buildDistExe" -ForegroundColor Green
}

if (-not $SkipInstaller) {
    if (-not (Test-Path $buildDistExe)) {
        throw "Exécutable temporaire introuvable pour l'installateur: $buildDistExe"
    }

    $iscc = Find-InnoCompiler -Preferred $InnoCompiler
    Invoke-Step -FilePath $iscc -Arguments @($issFile) -Label 'Inno Setup'

    if (-not (Test-Path $buildInstaller)) {
        throw "Installateur Inno Setup introuvable: $buildInstaller"
    }

    Move-Item -Path $buildInstaller -Destination $finalInstaller -Force
    Write-Host "Installateur généré: $finalInstaller" -ForegroundColor Green

    if (Test-Path $buildDistExe) {
        Remove-Item $buildDistExe -Force
    }
}

if (Test-Path $legacyRootExe) {
    Remove-Item $legacyRootExe -Force
}

Write-Host ''
Write-Host "$appName build terminé." -ForegroundColor Green

