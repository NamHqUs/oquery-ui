using Microsoft.Extensions.Configuration;

namespace Demo.Repositories.FileStorage;

public sealed class FilePathResolver(IConfiguration configuration)
{
    const string FOLDER_NAME = "UserData";
    public string GetBuiltinStoreFolder(string? subDir)
    {
        var rootDir = Path.Combine(Environment.CurrentDirectory,
            configuration["FileStoragePath"] ?? throw new InvalidOperationException("Configuration is missing [FileStoragePath]."));

        return subDir is null ? rootDir : Path.Combine(rootDir, subDir);
    }

    public string GetUserStoreFolder(string userSectionId, string? subDir)
    {
        if (string.IsNullOrWhiteSpace(userSectionId) || Path.GetFileName(userSectionId) != userSectionId)
            throw new InvalidOperationException("User section ID is not available.");

        var rootDir = Path.Combine(Environment.CurrentDirectory,
            configuration["FileStoragePath"] ?? throw new InvalidOperationException("Configuration is missing [FileStoragePath]."));

        return subDir is null
            ? Path.Combine(rootDir, FOLDER_NAME, userSectionId)
            : Path.Combine(rootDir, FOLDER_NAME, userSectionId, subDir);
    }
}
