$fileStoragePath = (Resolve-Path (Join-Path $PSScriptRoot '..\..\data-storage')).Path

docker image inspect oquery-ui:dev *> $null
if ($LASTEXITCODE -ne 0) {
	throw "Image oquery-ui:dev not found. Run docker-build.ps1 first."
}

docker run --rm `
	-p 21210:8080 `
	-e DbProvider__Default=Sqlite `
	-e Setup__FileStoragePath="../var/data" `
	-v "${fileStoragePath}:/var/data" `
	oquery-ui:dev
if ($LASTEXITCODE -ne 0) {
	throw "Docker run failed with exit code $LASTEXITCODE"
}
