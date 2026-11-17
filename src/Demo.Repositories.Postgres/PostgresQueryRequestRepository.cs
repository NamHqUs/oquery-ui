using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Repositories.FileStorage;
using System.Globalization;
using System.Security.Cryptography;

namespace Demo.Repositories.Postgres;

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
                .Select(query => (query.Id, QueryRequestFileRepository.Serialize(query))));
    }

    public IReadOnlyCollection<QueryDto> GetBuiltin()
        => _store.List(PostgresDocumentStore.BuiltinSectionId, isBuiltin: true)
            .Select(row => ParseRow(row.Id, row.Body, isBuiltin: true))
            .ToArray();

    public IReadOnlyCollection<QueryDto> GetUserDefined(string userSectionId)
        => _store.List(userSectionId, isBuiltin: false)
            .OrderByDescending(row => row.Id, StringComparer.Ordinal)
            .Select(row => ParseRow(row.Id, row.Body, isBuiltin: false))
            .ToArray();

    public QueryDto? Get(string userSectionId, string id)
    {
        var body = _store.Find(userSectionId, id);
        return body is null ? null : ParseRow(id, body, isBuiltin: false);
    }

    public void Save(string userSectionId, QueryDto query)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Entity);
        ArgumentNullException.ThrowIfNull(query.Projections);

        _store.Upsert(userSectionId, query.Id, QueryRequestFileRepository.Serialize(query));
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

    private static QueryDto ParseRow(string id, string body, bool isBuiltin)
        => QueryRequestFileRepository.ParseQueryRequest(body, isBuiltin, id, id);
}
