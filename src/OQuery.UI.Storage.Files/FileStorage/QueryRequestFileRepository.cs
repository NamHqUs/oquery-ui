using OQuery.UI.Abstracts;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace OQuery.UI.Storage.Files.FileStorage;

/// <summary>Stores user-defined query requests as JSON text; parsing them into query definitions is left to the consumer.</summary>
public sealed class QueryRequestFileRepository : FileRepositoryBase<QueryRequestRecordDto>, IQueryRequestRepository
{
    private const string FOLDER_NAME = "queries";
    private const string FILE_EXTENSION = ".json";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly IReadOnlyCollection<QueryRequestRecordDto> _builtin;

    public QueryRequestFileRepository(FilePathResolver filePathResolver, IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
        : base(filePathResolver, FOLDER_NAME, FILE_EXTENSION)
    {
        ArgumentNullException.ThrowIfNull(builtinQueries);
        _builtin = builtinQueries;
    }

    public override string CreateId(string userSectionId)
    {
        string id;
        do
        {
            id = $"{DateTime.UtcNow.ToString("yy-MM-dd-HH-mm-ss", CultureInfo.InvariantCulture)}-{RandomNumberGenerator.GetString(ID_CHARACTERS, 8)}";
        }
        while (File.Exists(GetUserFilePath(userSectionId, id)));

        return id;
    }

    public override IReadOnlyCollection<QueryRequestRecordDto> GetAll(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        var users = !Directory.Exists(dir)
            ? []
            : Directory.EnumerateFiles(dir)
                .Where(IsJsonFile)
                .OrderByDescending(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
                .Select(ReadRecord)
                .ToArray();
        return [.. _builtin, .. users];
    }

    public override QueryRequestRecordDto? Get(string userSectionId, string id)
    {
        var builtin = _builtin.FirstOrDefault(query => query.Id == id);
        if (builtin is not null)
            return builtin;

        var path = GetUserFilePath(userSectionId, id);
        return File.Exists(path)
            ? ReadRecord(path)
            : null;
    }

    public override void Save(string userSectionId, QueryRequestRecordDto request)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Json);
        if (_builtin.Any(query => query.Id == request.Id))
            throw new InvalidOperationException($"Built-in query '{request.Id}' is read-only.");

        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(GetUserFilePath(userSectionId, request.Id), request.Json);
    }

    public override bool Delete(string userSectionId, string id)
    {
        if (_builtin.Any(query => query.Id == id))
            throw new InvalidOperationException($"Built-in query '{id}' is read-only.");

        var path = GetUserFilePath(userSectionId, id);
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private static bool IsJsonFile(string path)
        => string.Equals(Path.GetExtension(path), FILE_EXTENSION, StringComparison.OrdinalIgnoreCase);

    private static QueryRequestRecordDto ReadRecord(string path)
    {
        var json = File.ReadAllText(path);
        var root = JsonNode.Parse(json)?.AsObject()
            ?? throw new InvalidDataException($"Query request '{path}' is not a JSON object.");
        var id = root["id"]?.GetValue<string>() ?? root["Id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidDataException($"Query request '{path}' is missing an id.");

        return new QueryRequestRecordDto(id, json, false);
    }
}
