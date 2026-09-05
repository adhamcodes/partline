param(
  [switch]$Approved
)

$ErrorActionPreference = 'Stop'
if (-not $Approved) {
  throw 'Mission 002 explicit approval is required before this script may run.'
}

$taskSecurePhone = Read-Host 'Authorized test phone in E.164 format (input hidden)' -AsSecureString
$taskPhonePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecurePhone)

try {
  $env:PARTLINE_TEST_PHONE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPhonePointer)
  $env:PARTLINE_TEST_REGION = Read-Host 'CALL-E region code for this number (for example BD or US)'
  $env:PARTLINE_TEST_LANGUAGE = Read-Host 'Call language (for example English)'
  $env:PARTLINE_TEST_TIMEZONE = Read-Host 'Recipient IANA timezone (for example Asia/Dhaka)'
  $env:PARTLINE_TEST_DEADLINE = Read-Host 'Today at 16:00 with UTC offset (for example 2026-09-05T16:00:00+06:00)'
  $env:PARTLINE_LIVE_APPROVAL = 'MISSION-002-ONE-CALL'
  npm run live:test
  if ($LASTEXITCODE -ne 0) { throw 'PARTLINE live validation did not complete successfully.' }
}
finally {
  Remove-Item Env:PARTLINE_TEST_PHONE -ErrorAction SilentlyContinue
  Remove-Item Env:PARTLINE_TEST_REGION -ErrorAction SilentlyContinue
  Remove-Item Env:PARTLINE_TEST_LANGUAGE -ErrorAction SilentlyContinue
  Remove-Item Env:PARTLINE_TEST_TIMEZONE -ErrorAction SilentlyContinue
  Remove-Item Env:PARTLINE_TEST_DEADLINE -ErrorAction SilentlyContinue
  Remove-Item Env:PARTLINE_LIVE_APPROVAL -ErrorAction SilentlyContinue
  if ($taskPhonePointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPhonePointer)
  }
}
