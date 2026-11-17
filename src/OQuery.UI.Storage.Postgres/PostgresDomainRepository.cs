using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Storage.Files.FileStorage;
using System.Security.Cryptography;
using System.Text.Json;

namespace OQuery.UI.Storage.Postgres;

public sealed class PostgresDomainRepository : IDomainRepository
{
    private const string TABLE = "oquery_domains";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private readonly PostgresDocumentStore _store;

    public PostgresDomainRepository(string connectionString, FilePathResolver filePathResolver)
    {
        var builtinSource = new DomainFileRepository(filePathResolver);
        _store = new PostgresDocumentStore(
            connectionString,
            TABLE,
            () => builtinSource.GetBuiltin()
                .Select(domain => (domain.Id, JsonSerializer.Serialize(domain))));
    }

    public IReadOnlyCollection<DomainDto> GetBuiltin()
        => _store.List(PostgresDocumentStore.BuiltinSectionId, isBuiltin: true)
            .Select(row => ToDomain(row.Id, row.Body, isBuiltin: true))
            .ToArray();

    public IReadOnlyCollection<DomainDto> GetUserDefined(string userSectionId)
        => _store.List(userSectionId, isBuiltin: false)
            .Select(row => ToDomain(row.Id, row.Body, isBuiltin: false))
            .ToArray();

    public DomainDto? Get(string userSectionId, string id)
    {
        var body = _store.Find(userSectionId, id);
        return body is null ? null : ToDomain(id, body, isBuiltin: false);
    }

    public void Save(string userSectionId, DomainDto scope)
    {
        ArgumentNullException.ThrowIfNull(scope);
        ArgumentException.ThrowIfNullOrWhiteSpace(scope.Id);
        _store.Upsert(userSectionId, scope.Id, JsonSerializer.Serialize(scope));
    }

    public bool Delete(string userSectionId, string id)
        => _store.Delete(userSectionId, id);

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

    private static DomainDto ToDomain(string id, string body, bool isBuiltin)
    {
        var domain = JsonSerializer.Deserialize<DomainDto>(body)
            ?? throw new InvalidDataException($"Domain '{id}' is empty.");
        domain.Id = id;
        domain.IsBuiltin = isBuiltin;
        return domain;
    }
}
