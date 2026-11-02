$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fileStoragePath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\data-storage')).Path

Push-Location $repositoryRoot
try {
	docker build -t oquery-ui:dev -f .\src\OQuery.UI\Dockerfile .
	if ($LASTEXITCODE -ne 0) {
		throw "Docker build failed with exit code $LASTEXITCODE"
	}

	docker run --rm `
		-p 21210:8080 `
		-e DbProvider__Default=Sqlite `
		-e DbProvider__DbScriptsPath=../scripts `
		-e FileStoragePath="../var/data" `
		-e MetadataPath="../oquery/data-storage/metadata" `
		-v "${fileStoragePath}:/var/data" `
		oquery-ui:dev
	if ($LASTEXITCODE -ne 0) {
		throw "Docker run failed with exit code $LASTEXITCODE"
	}
}
finally {
	Pop-Location
}
