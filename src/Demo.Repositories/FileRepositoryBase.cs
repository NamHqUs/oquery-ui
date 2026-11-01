using Demo.Contracts.Repositories;
using Demo.Repositories.FileStorage;
using System.Security.Cryptography;

namespace Demo.Repositories;

public abstract class FileRepositoryBase<T> : IRepository<T>
{
    private readonly FilePathResolver _filePathResolver;
    private readonly string _folderName;
    private readonly string _fileExtension;

    protected FileRepositoryBase(
        FilePathResolver filePathResolver,
        string folderName,
        string fileExtension = ".json")
    {
        ArgumentNullException.ThrowIfNull(filePathResolver);
        ArgumentException.ThrowIfNullOrWhiteSpace(folderName);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileExtension);

        _filePathResolver = filePathResolver;
        _folderName = folderName;
        _fileExtension = fileExtension.StartsWith('.') ? fileExtension : $".{fileExtension}";
    }

    public abstract IReadOnlyCollection<T> GetBuiltin();
    public abstract IReadOnlyCollection<T> GetUserDefined(string userSectionId);
    public abstract T? Get(string userSectionId, string id);
    public abstract void Save(string userSectionId, T item);
    public abstract bool Delete(string userSectionId, string id);

    public virtual string CreateId(string userSectionId)
    {
        string id;
        do
        {
            id = CreateFileName();
        }
        while (File.Exists(GetUserFilePath(userSectionId, id)));

        return id;
    }

    protected string GetUserStoreFolder(string userSectionId)
        => _filePathResolver.GetUserStoreFolder(userSectionId, _folderName);

    protected string GetBuiltinStoreFolder()
        => _filePathResolver.GetBuiltinStoreFolder(_folderName);

    protected string GetUserFilePath(string userSectionId, string id)
    {
        if (string.IsNullOrWhiteSpace(id) || Path.GetFileName(id) != id)
            throw new ArgumentException("Repository ID is not a valid file name.", nameof(id));

        var fileName = id.EndsWith(_fileExtension, StringComparison.OrdinalIgnoreCase)
            ? id
            : $"{id}{_fileExtension}";
        var dir = GetUserStoreFolder(userSectionId);
        var path = Path.GetFullPath(Path.Combine(dir, fileName));
        var root = Path.GetFullPath(dir) + Path.DirectorySeparatorChar;
        if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Repository ID is not a valid file name.", nameof(id));
        return path;
    }

    private static string CreateFileName()
        => RandomNumberGenerator.GetString(
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            10);
}
