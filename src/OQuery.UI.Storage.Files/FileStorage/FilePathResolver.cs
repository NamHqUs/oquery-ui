using OQuery.UI.Abstracts;
using Microsoft.Extensions.Configuration;

namespace OQuery.UI.Storage.Files.FileStorage;

public sealed class FilePathResolver(IConfiguration configuration)
{
    public string GetUserDataRootDirectory()
        => BuiltinDatasets.GetRootDirectory(configuration["OQuery:Repositories:Files:UserDataStorePath"]);

    /// <summary>Returns the configured built-in folders for one kind, e.g. "Domains" or "Queries".</summary>
    public IReadOnlyCollection<string> GetBuiltinFolders(string kind)
        => configuration.GetSection("OQuery:Repositories:Files:BuiltinData")
            .GetChildren()
            .Select(item => item[kind])
            .Where(folder => !string.IsNullOrWhiteSpace(folder))
            .Select(folder => Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, folder!)))
            .ToArray();

    public IEnumerable<string> EnumerateBuiltinFiles(string kind, params string[] extensions)
        => BuiltinDatasets.EnumerateFiles(GetBuiltinFolders(kind), extensions);

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
