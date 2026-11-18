using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Globalization;
using System.Security.Cryptography;

namespace OQuery.UI.Storage.Postgres;

public sealed class PostgresQueryRequestRepository : IQueryRequestRepository
{
    private const string TABLE = "oquery_queries";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly PostgresDocumentStore _store;

    public PostgresQueryRequestRepository(string connectionString, FilePathResolver filePathResolver)
    {
        var builtinSource = new QueryRequestFileRepository(filePathResolver);
        _store = new PostgresDocumentStore(
            connectionString,
            TABLE,
            () => builtinSource.GetBuiltin()
                .Select(request => (request.Id, request.Json)));
    }

    public IReadOnlyCollection<QueryRequestRecordDto> GetBuiltin()
        => _store.List(PostgresDocumentStore.BuiltinSectionId, isBuiltin: true)
            .Select(row => new QueryRequestRecordDto(row.Id, row.Body, IsBuiltin: true))
            .ToArray();

    public IReadOnlyCollection<QueryRequestRecordDto> GetUserDefined(string userSectionId)
        => _store.List(userSectionId, isBuiltin: false)
            .OrderByDescending(row => row.Id, StringComparer.Ordinal)
            .Select(row => new QueryRequestRecordDto(row.Id, row.Body, IsBuiltin: false))
            .ToArray();

    public QueryRequestRecordDto? Get(string userSectionId, string id)
    {
        var body = _store.Find(userSectionId, id);
        return body is null ? null : new QueryRequestRecordDto(id, body, IsBuiltin: false);
    }

    public void Save(string userSectionId, QueryRequestRecordDto request)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Json);

        _store.Upsert(userSectionId, request.Id, request.Json);
    }

    public bool Delete(string userSectionId, string id)
        => _store.Delete(userSectionId, id);

    public string CreateId(string userSectionId)
    {
        string id;
        do
        {
            id = $"{DateTime.UtcNow.ToString("yy-MM-dd-HH-mm-ss", CultureInfo.InvariantCulture)}-{RandomNumberGenerator.GetString(ID_CHARACTERS, 8)}";
        }
        while (_store.Find(userSectionId, id) is not null);

        return id;
    }
}
