$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

Push-Location $repositoryRoot
try {
	docker build -t oquery-ui:dev -f .\src\OQuery.UI.Api\Dockerfile .
	if ($LASTEXITCODE -ne 0) {
		throw "Docker build failed with exit code $LASTEXITCODE"
	}
}
finally {
	Pop-Location
}
