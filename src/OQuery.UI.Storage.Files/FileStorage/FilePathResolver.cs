using Microsoft.Extensions.Configuration;

namespace OQuery.UI.Storage.Files.FileStorage;

public sealed class FilePathResolver(IConfiguration configuration)
{
    public string GetUserDataRootDirectory()
    {
        var userData = configuration["OQuery:Repositories:Files:UserData"]
            ?? throw new InvalidOperationException("Configuration 'OQuery:Repositories:Files:UserData' is missing.");
        return Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, userData));
    }

    public string GetUserStoreFolder(string userSectionId, string? subDir)
    {
        if (string.IsNullOrWhiteSpace(userSectionId) || Path.GetFileName(userSectionId) != userSectionId)
            throw new InvalidOperationException("User section ID is not available.");

        var rootDir = GetUserDataRootDirectory();

        return subDir is null
            ? Path.Combine(rootDir, userSectionId)
            : Path.Combine(rootDir, userSectionId, subDir);
    }
}
