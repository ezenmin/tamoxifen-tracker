# Test runner script
Write-Host "=== Running Tests ===" -ForegroundColor Cyan
node tests/run-tests.js
if ($LASTEXITCODE -eq 0) {
    Write-Host "All tests passed" -ForegroundColor Green
} else {
    Write-Host "Tests failed" -ForegroundColor Red
}
exit $LASTEXITCODE
