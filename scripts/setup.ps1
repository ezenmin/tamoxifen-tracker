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
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --save-dev http-server
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

# Verify test infrastructure
Write-Host "Running tests..." -ForegroundColor Yellow
node tests/run-tests.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Tests failed - fix before proceeding!" -ForegroundColor Red
    exit 1
}
Write-Host "Tests passing" -ForegroundColor Green

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "Run: .\scripts\dev.ps1 to start development server" -ForegroundColor White
