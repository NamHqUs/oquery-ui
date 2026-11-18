using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using System.Globalization;
using System.Security.Cryptography;

namespace OQuery.UI.Storage.Postgres;

public sealed class PostgresQueryRequestRepository : IQueryRequestRepository
{
    internal const string TABLE = "oquery_queries";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly PostgresDocumentStore _store;
    private readonly IReadOnlyCollection<QueryRequestRecordDto> _builtin;

    internal PostgresQueryRequestRepository(PostgresDocumentStore store, IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
    {
        _store = store;
        _builtin = builtinQueries;
    }

    public IReadOnlyCollection<QueryRequestRecordDto> GetAll(string userSectionId)
        => [.. _builtin, .. GetUserDefined(userSectionId)];

    public QueryRequestRecordDto? Get(string userSectionId, string id)
    {
        var builtin = _builtin.FirstOrDefault(query => query.Id == id);
        if (builtin is not null)
            return builtin;

        var body = _store.Find(userSectionId, id);
        return body is null ? null : new QueryRequestRecordDto(id, body, IsBuiltin: false);
    }

    public void Save(string userSectionId, QueryRequestRecordDto request)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Json);
        if (_builtin.Any(query => query.Id == request.Id))
            throw new InvalidOperationException($"Built-in query '{request.Id}' is read-only.");

        _store.Upsert(userSectionId, request.Id, request.Json);
    }

    public bool Delete(string userSectionId, string id)
    {
        if (_builtin.Any(query => query.Id == id))
            throw new InvalidOperationException($"Built-in query '{id}' is read-only.");
        return _store.Delete(userSectionId, id);
    }

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

    private IReadOnlyCollection<QueryRequestRecordDto> GetUserDefined(string userSectionId)
        => _store.List(userSectionId)
            .OrderByDescending(row => row.Id, StringComparer.Ordinal)
            .Select(row => new QueryRequestRecordDto(row.Id, row.Body, IsBuiltin: false))
            .ToArray();
}
