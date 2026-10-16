<#
.SYNOPSIS
    Ultima Calc 起動用ランチャースクリプト（Windows専用）
.DESCRIPTION
    ブラウザー（Microsoft Edge または Google Chrome）のアプリモード（--app）で
    Ultima Calc を起動し、指定したサイズを適用します。オプションで画面中央配置も可能です。
.PARAMETER Browser
    起動に使用するブラウザーを指定します。'Edge' または 'Chrome'。（既定値: 'Edge'）
.PARAMETER Width
    適用するウィンドウの幅をピクセル単位で指定します。（既定値: 640）
.PARAMETER Height
    適用するウィンドウの高さをピクセル単位で指定します。（既定値: 900）
.PARAMETER Center
    指定した場合、ウィンドウをプライマリ画面の作業領域中央へ自動配置します。
    省略時は位置を移動せず、現在の位置（OS/ブラウザーの記憶位置）のままサイズのみ変更します。
.EXAMPLE
    .\launch.ps1
    Edge で起動し、位置は維持したままサイズ 640x900 を適用します。
.EXAMPLE
    .\launch.ps1 -Center
    Edge で起動し、画面中央にサイズ 640x900 で配置します。
.EXAMPLE
    .\launch.ps1 -Browser Chrome -Width 500 -Height 800 -Center
    Google Chrome で起動し、幅 500px・高さ 800px で画面中央に配置します。
#>

param(
    [ValidateSet('Edge', 'Chrome')]
    [string]$Browser = 'Edge',

    [int]$Width = 640,
    [int]$Height = 900,

    [switch]$Center
)

# -----------------------------------------------------------------------------
# Win32 API の定義（ウィンドウリサイズ・配置用）
# -----------------------------------------------------------------------------
$code = @'
using System;
using System.Runtime.InteropServices;

public class Win32Window {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
'@
Add-Type -TypeDefinition $code

# -----------------------------------------------------------------------------
# ブラウザーの実行ファイルパス定義
# -----------------------------------------------------------------------------
$edgeCandidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)

$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

if ($Browser -eq 'Chrome') {
    $browserExe = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    $procName = "chrome"
    $browserLabel = "Google Chrome"
} else {
    $browserExe = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    $procName = "msedge"
    $browserLabel = "Microsoft Edge"
}

if (-not $browserExe) {
    Write-Error "${browserLabel} の実行ファイルが見つかりませんでした。"
    exit 1
}

# -----------------------------------------------------------------------------
# index.html のパス解決とアプリモード起動
# -----------------------------------------------------------------------------
$htmlPath = Join-Path $PSScriptRoot "index.html"
if (-not (Test-Path $htmlPath)) {
    Write-Error "index.html が見つかりませんでした: $htmlPath"
    exit 1
}

$fileUri = "file:///" + $htmlPath.Replace("\", "/")
Start-Process $browserExe -ArgumentList "--app=`"$fileUri`""

# -----------------------------------------------------------------------------
# ウィンドウハンドルの検出とリサイズ（最大3秒待機）
# -----------------------------------------------------------------------------
$timeout = [DateTime]::Now.AddSeconds(3)
$targetHwnd = [IntPtr]::Zero

while ([DateTime]::Now -lt $timeout) {
    Start-Sleep -Milliseconds 100
    $proc = Get-Process -Name $procName -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowTitle -like "*Ultima Calc*" -and $_.MainWindowHandle -ne [IntPtr]::Zero
    } | Select-Object -First 1

    if ($proc) {
        $targetHwnd = $proc.MainWindowHandle
        break
    }
}

if ($targetHwnd -ne [IntPtr]::Zero) {
    # SetWindowPos フラグ
    # 0x0004: SWP_NOZORDER (現在のZオーダーを維持)
    # 0x0040: SWP_SHOWWINDOW (ウィンドウを表示)
    # 0x0002: SWP_NOMOVE (位置を変更せずサイズのみ変更)
    if ($Center) {
        Add-Type -AssemblyName System.Windows.Forms
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
        $x = [Math]::Max(0, [int](($screen.Width - $Width) / 2))
        $y = [Math]::Max(0, [int](($screen.Height - $Height) / 2))
        $flags = 0x0004 -bor 0x0040 # SWP_NOZORDER | SWP_SHOWWINDOW

        [Win32Window]::SetWindowPos($targetHwnd, [IntPtr]::Zero, $x, $y, $Width, $Height, $flags) | Out-Null
    } else {
        # 位置は変更せず、指定サイズのみ適用
        $flags = 0x0002 -bor 0x0004 -bor 0x0040 # SWP_NOMOVE | SWP_NOZORDER | SWP_SHOWWINDOW

        [Win32Window]::SetWindowPos($targetHwnd, [IntPtr]::Zero, 0, 0, $Width, $Height, $flags) | Out-Null
    }
}
