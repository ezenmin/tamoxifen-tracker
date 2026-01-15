# Setup script for Tamoxifen Tracker
# Run this first to initialize the project

Write-Host "=== Tamoxifen Tracker Setup ===" -ForegroundColor Cyan

# Check Node.js
$nodeVersion = node --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Node.js is not installed. Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js $nodeVersion found" -ForegroundColor Green

# Install dependencies
Write-Host "Installing dependencies (npm install)..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

# Optional: Supabase deploy readiness (warn-only)
$missingSupabase = @()
if (-not $env:SUPABASE_ACCESS_TOKEN) { $missingSupabase += "SUPABASE_ACCESS_TOKEN" }
if (-not $env:SUPABASE_DB_PASSWORD) { $missingSupabase += "SUPABASE_DB_PASSWORD" }
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) { $missingSupabase += "SUPABASE_SERVICE_ROLE_KEY" }
if ($missingSupabase.Count -gt 0) {
    Write-Host "NOTE: Supabase deploy env vars not set (optional): $($missingSupabase -join ', ')" -ForegroundColor Yellow
    Write-Host "      Setup/tests/dev server still work without these." -ForegroundColor Yellow
}

# Verify test infrastructure
Write-Host "Running tests (npm test)..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Tests failed - fix before proceeding!" -ForegroundColor Red
    exit 1
}
Write-Host "Tests passing" -ForegroundColor Green

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "Run: .\scripts\dev.ps1 to start development server" -ForegroundColor White
