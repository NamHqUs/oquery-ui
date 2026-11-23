using OQuery.UI.Abstracts.Repositories;

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

    public string GetProjectsFolder(string userSectionId)
        => GetUserStoreFolder(userSectionId, "projects");

    /// <summary>Returns the folder of one project's store (for example "queries") inside the project folder.</summary>
    public string GetProjectStoreFolder(StorageScope scope, string subDir)
    {
        if (string.IsNullOrWhiteSpace(scope.ProjectId) || Path.GetFileName(scope.ProjectId) != scope.ProjectId)
            throw new ArgumentException("Project ID is not a valid folder name.", nameof(scope));

        return Path.Combine(GetProjectsFolder(scope.UserSectionId), scope.ProjectId, subDir);
    }

    /// <summary>Returns the folder of one domain's store (for example "playground") inside projects/{projectId}/{domainId}.</summary>
    public string GetDomainStoreFolder(StorageScope scope, string domainId, string subDir)
    {
        if (string.IsNullOrWhiteSpace(scope.ProjectId) || Path.GetFileName(scope.ProjectId) != scope.ProjectId)
            throw new ArgumentException("Project ID is not a valid folder name.", nameof(scope));
        if (string.IsNullOrWhiteSpace(domainId) || Path.GetFileName(domainId) != domainId
            || domainId is "domains" or "queries")
            throw new ArgumentException("Domain ID is not a valid folder name.", nameof(domainId));

        return Path.Combine(GetProjectsFolder(scope.UserSectionId), scope.ProjectId, domainId, subDir);
    }
}
