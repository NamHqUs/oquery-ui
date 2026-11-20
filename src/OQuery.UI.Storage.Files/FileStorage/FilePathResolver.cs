namespace OQuery.UI.Storage.Files.FileStorage;

/// <param name="userDataDirectory">Relative paths resolve against the current directory.</param>
public sealed class FilePathResolver(string userDataDirectory)
{
    public string GetUserDataRootDirectory()
        => Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, userDataDirectory));

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
