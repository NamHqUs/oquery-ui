using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Security.Cryptography;

namespace OQuery.UI.Storage.Files;

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

    protected FilePathResolver PathResolver => _filePathResolver;

    public abstract IReadOnlyCollection<T> GetAll(StorageScope scope);
    public abstract T? Get(StorageScope scope, string id);
    public abstract void Save(StorageScope scope, T item);
    public abstract bool Delete(StorageScope scope, string id);

    public virtual string CreateId(StorageScope scope)
    {
        string id;
        do
        {
            id = CreateFileName();
        }
        while (File.Exists(GetUserFilePath(scope, id)));

        return id;
    }

    protected string GetStoreFolder(StorageScope scope)
        => _filePathResolver.GetProjectStoreFolder(scope, _folderName);

    protected string GetUserFilePath(StorageScope scope, string id)
    {
        if (string.IsNullOrWhiteSpace(id) || Path.GetFileName(id) != id)
            throw new ArgumentException("Repository ID is not a valid file name.", nameof(id));

        var fileName = id.EndsWith(_fileExtension, StringComparison.OrdinalIgnoreCase)
            ? id
            : $"{id}{_fileExtension}";
        var dir = GetStoreFolder(scope);
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
