using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Security.Cryptography;

namespace OQuery.UI.Storage.Files;

public abstract class FileRepositoryBase<T> : IRepository<T>
{
    private readonly FilePathResolver _filePathResolver;
    private readonly string _folderName;
    private readonly string _fileExtension;
    private readonly IReadOnlyCollection<T> _builtin;

    /// <param name="builtin">Read-only built-in items, supplied by the consumer. This repository never seeds or saves them.</param>
    protected FileRepositoryBase(
        FilePathResolver filePathResolver,
        string folderName,
        IReadOnlyCollection<T> builtin,
        string fileExtension = ".json")
    {
        ArgumentNullException.ThrowIfNull(filePathResolver);
        ArgumentException.ThrowIfNullOrWhiteSpace(folderName);
        ArgumentNullException.ThrowIfNull(builtin);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileExtension);

        _filePathResolver = filePathResolver;
        _folderName = folderName;
        _builtin = builtin;
        _fileExtension = fileExtension.StartsWith('.') ? fileExtension : $".{fileExtension}";
    }

    protected FilePathResolver PathResolver => _filePathResolver;

    public IReadOnlyCollection<T> GetBuiltin() => _builtin;
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
