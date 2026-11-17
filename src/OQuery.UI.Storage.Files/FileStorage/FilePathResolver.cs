using OQuery.UI.Abstracts;
using Microsoft.Extensions.Configuration;

namespace OQuery.UI.Storage.Files.FileStorage;

public sealed class FilePathResolver(IConfiguration configuration)
{
    const string FOLDER_NAME = "UserData";

    public string GetStorageRootDirectory()
        => BuiltinDatasets.GetRootDirectory(configuration["Setup:FileStoragePath"]);

    public string GetBuiltinRootDirectory()
        => BuiltinDatasets.GetRootDirectory(configuration["Setup:BuiltinPath"]);

    public IReadOnlyCollection<string> GetDataSets()
        => configuration.GetSection("Setup:DataSets").Get<string[]>() ?? [];

    public IEnumerable<string> EnumerateBuiltinFiles(string folder, params string[] extensions)
        => BuiltinDatasets.EnumerateFiles(GetBuiltinRootDirectory(), GetDataSets(), folder, extensions);

    public string GetUserStoreFolder(string userSectionId, string? subDir)
    {
        if (string.IsNullOrWhiteSpace(userSectionId) || Path.GetFileName(userSectionId) != userSectionId)
            throw new InvalidOperationException("User section ID is not available.");

        var rootDir = GetStorageRootDirectory();

        return subDir is null
            ? Path.Combine(rootDir, FOLDER_NAME, userSectionId)
            : Path.Combine(rootDir, FOLDER_NAME, userSectionId, subDir);
    }
}
