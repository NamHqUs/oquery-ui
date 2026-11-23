using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Security.Cryptography;
using System.Text.Json;

namespace OQuery.UI.Storage.Files.FileStorage;

/// <summary>Stores saved playgrounds at projects/{projectId}/{domainId}/playground/{id}.json. Tab content is kept as raw text.</summary>
public sealed class PlaygroundFileRepository(FilePathResolver filePathResolver) : IPlaygroundRepository
{
    private const string FOLDER_NAME = "playground";
    private const string FILE_EXTENSION = ".json";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    public string CreateId(StorageScope scope, string domainId)
    {
        string id;
        do
        {
            id = RandomNumberGenerator.GetString(ID_CHARACTERS, 12);
        }
        while (File.Exists(FilePath(scope, domainId, id)));

        return id;
    }

    public IReadOnlyCollection<PlaygroundDto> GetAll(StorageScope scope, string domainId)
    {
        var dir = Folder(scope, domainId);
        return !Directory.Exists(dir)
            ? []
            : Directory.EnumerateFiles(dir, "*" + FILE_EXTENSION)
                .Select(ReadRecord)
                .ToArray();
    }

    public PlaygroundDto? Get(StorageScope scope, string domainId, string id)
    {
        var path = FilePath(scope, domainId, id);
        return File.Exists(path) ? ReadRecord(path) : null;
    }

    public void Save(StorageScope scope, PlaygroundDto playground)
    {
        ArgumentNullException.ThrowIfNull(playground);
        ArgumentException.ThrowIfNullOrWhiteSpace(playground.Id);

        Directory.CreateDirectory(Folder(scope, playground.DomainId));
        File.WriteAllText(FilePath(scope, playground.DomainId, playground.Id), JsonSerializer.Serialize(playground, JsonOptions));
    }

    public bool Delete(StorageScope scope, string domainId, string id)
    {
        var path = FilePath(scope, domainId, id);
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private string Folder(StorageScope scope, string domainId)
        => filePathResolver.GetDomainStoreFolder(scope, domainId, FOLDER_NAME);

    private string FilePath(StorageScope scope, string domainId, string id)
    {
        if (string.IsNullOrWhiteSpace(id) || Path.GetFileName(id) != id)
            throw new ArgumentException("Playground ID is not a valid file name.", nameof(id));

        return Path.Combine(Folder(scope, domainId), id + FILE_EXTENSION);
    }

    private static PlaygroundDto ReadRecord(string path)
        => JsonSerializer.Deserialize<PlaygroundDto>(File.ReadAllText(path), JsonOptions)
            ?? throw new InvalidDataException($"Playground '{path}' is not a JSON object.");
}
