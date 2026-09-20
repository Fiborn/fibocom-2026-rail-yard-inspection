$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$jar = Join-Path $root 'smart-till-eye-1.0.0.jar'
$backendLog = Join-Path $root 'backend-start.out.log'
$backendErrLog = Join-Path $root 'backend-start.err.log'
$gpsScript = Join-Path $root 'gps_receiver_local.py'
$gpsLog = Join-Path $root 'gps-receiver.out.log'
$gpsErrLog = Join-Path $root 'gps-receiver.err.log'
$frontendUrl = 'http://127.0.0.1:8088/'

function Test-PortListening {
    param([int]$Port)
    $lines = netstat -ano | Select-String (":$Port\s+.*LISTENING")
    return [bool]$lines
}

function Wait-Port {
    param(
        [int]$Port,
        [int]$Seconds
    )
    for ($i = 0; $i -lt $Seconds; $i++) {
        Start-Sleep -Seconds 1
        if (Test-PortListening -Port $Port) {
            return $true
        }
    }
    return $false
}

function Resolve-Java {
    $localJava = Join-Path $root 'runtime\bin\java.exe'
    if (Test-Path -LiteralPath $localJava) { return $localJava }
    if ($env:JAVA_HOME) {
        $javaHomeExe = Join-Path $env:JAVA_HOME 'bin\java.exe'
        if (Test-Path -LiteralPath $javaHomeExe) { return $javaHomeExe }
    }
    foreach ($candidate in @('C:\Program Files\Java\jdk-21\bin\java.exe', 'C:\Program Files\Java\jdk-17\bin\java.exe')) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $whereJava = Get-Command java.exe -ErrorAction SilentlyContinue
    if ($whereJava) { return $whereJava.Source }
    return $null
}

function Resolve-Python {
    $preferred = 'E:\python\python.exe'
    if (Test-Path -LiteralPath $preferred) { return $preferred }
    $wherePython = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($wherePython) { return $wherePython.Source }
    return $null
}

function Start-HiddenProcess {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$StdOutPath,
        [string]$StdErrPath
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $quotedArgs = ($Arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
    $psi.FileName = $env:ComSpec
    $psi.Arguments = '/c ""{0}" {1} >> "{2}" 2>> "{3}""' -f $FilePath, $quotedArgs, $StdOutPath, $StdErrPath
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $true
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()
    return $process.Id
}

if (-not (Test-Path -LiteralPath $jar)) {
    throw "Backend JAR not found: $jar"
}
if (-not (Test-Path -LiteralPath $gpsScript)) {
    throw "GPS receiver script not found: $gpsScript"
}

$javaExe = Resolve-Java
if (-not $javaExe) {
    throw 'Java 17 or newer was not found. Install Java 17+ or put a JDK in the runtime folder.'
}

$pythonExe = Resolve-Python
if (-not $pythonExe) {
    throw 'Python was not found. Install Python or update the launcher Python path.'
}

if (-not (Test-PortListening -Port 5001)) {
    Write-Host "Starting GPS receiver. Log: $gpsLog"
    $gpsPid = Start-HiddenProcess -FilePath $pythonExe -Arguments @($gpsScript) -WorkingDirectory (Split-Path -Parent $gpsScript) -StdOutPath $gpsLog -StdErrPath $gpsErrLog
    Write-Host "GPS receiver PID: $gpsPid"
} else {
    Write-Host 'GPS receiver port 5001 is already listening. Reusing existing service.'
}

if (-not (Wait-Port -Port 5001 -Seconds 15)) {
    throw "GPS receiver did not start within 15 seconds. Check: $gpsLog / $gpsErrLog"
}
Write-Host 'GPS receiver is ready: http://127.0.0.1:5001/location'

if (-not (Test-PortListening -Port 8088)) {
    Write-Host "Starting backend. Log: $backendLog"
    if (-not $env:DEEPSEEK_API_KEY) { Write-Host 'DEEPSEEK_API_KEY is not set. Agent chat will use fallback advice.' }
    $backendPid = Start-HiddenProcess -FilePath $javaExe -Arguments @('-jar', $jar, '--server.address=0.0.0.0', '--server.port=8088') -WorkingDirectory $root -StdOutPath $backendLog -StdErrPath $backendErrLog
    Write-Host "Backend PID: $backendPid"
} else {
    Write-Host 'Backend port 8088 is already listening. Reusing existing service.'
}

if (-not (Wait-Port -Port 8088 -Seconds 30)) {
    throw "Backend did not start within 30 seconds. Check: $backendLog / $backendErrLog"
}

Write-Host "Backend is ready: $frontendUrl"
& $env:ComSpec /c start "" $frontendUrl
Write-Host 'SmartTillEye started. GPS receiver, backend, video stream and frontend are ready through the backend service.'

