using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using System.Security.Cryptography;
using System.Text.Json;

namespace OQuery.UI.Storage.Postgres;

public sealed class PostgresDomainRepository : IDomainRepository
{
    internal const string TABLE = "oquery_domains";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly PostgresDocumentStore _store;
    private readonly IReadOnlyCollection<DomainDto> _builtin;

    internal PostgresDomainRepository(PostgresDocumentStore store, IReadOnlyCollection<DomainDto> builtinDomains)
    {
        _store = store;
        _builtin = builtinDomains;
    }

    public IReadOnlyCollection<DomainDto> GetAll(string userSectionId)
        => [.. _builtin, .. GetUserDefined(userSectionId)];

    public DomainDto? Get(string userSectionId, string id)
    {
        var builtin = _builtin.FirstOrDefault(domain => domain.Id == id);
        if (builtin is not null)
            return builtin;

        var body = _store.Find(userSectionId, id);
        return body is null ? null : ToDomain(id, body);
    }

    public void Save(string userSectionId, DomainDto scope)
    {
        ArgumentNullException.ThrowIfNull(scope);
        ArgumentException.ThrowIfNullOrWhiteSpace(scope.Id);
        if (_builtin.Any(domain => domain.Id == scope.Id))
            throw new InvalidOperationException($"Built-in domain '{scope.Id}' is read-only.");
        if (_builtin.Any(domain => string.Equals(domain.Name, scope.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"User domain '{scope.Name}' cannot replace a built-in domain.");

        _store.Upsert(userSectionId, scope.Id, JsonSerializer.Serialize(scope));
    }

    public bool Delete(string userSectionId, string id)
    {
        if (_builtin.Any(domain => domain.Id == id))
            throw new InvalidOperationException($"Built-in domain '{id}' is read-only.");
        return _store.Delete(userSectionId, id);
    }

    public string CreateId(string userSectionId)
    {
        string id;
        do
        {
            id = RandomNumberGenerator.GetString(ID_CHARACTERS, 10);
        }
        while (_store.Find(userSectionId, id) is not null);

        return id;
    }

    private IReadOnlyCollection<DomainDto> GetUserDefined(string userSectionId)
        => _store.List(userSectionId)
            .Select(row => ToDomain(row.Id, row.Body))
            .ToArray();

    private static DomainDto ToDomain(string id, string body)
    {
        var domain = JsonSerializer.Deserialize<DomainDto>(body)
            ?? throw new InvalidDataException($"Domain '{id}' is empty.");
        domain.Id = id;
        domain.IsBuiltin = false;
        return domain;
    }
}
