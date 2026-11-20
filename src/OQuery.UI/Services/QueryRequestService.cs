using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery;
using OQuery.QueryDefinitions.Parsers;

namespace OQuery.UI.Services;

public sealed class QueryRequestService(
    IQueryRequestRepository repository,
    IUserSectionManager userSectionManager,
    IDynamicQueryService dynamicQueryService) : IQueryRequestService
{
    public IReadOnlyList<QueryDto> List(string projectId, string domainId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(domainId);
        var scope = Scope(projectId);
        var builtin = Builtins(scope);
        var builtinNames = builtin.Select(query => query.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var custom = UserDefined(scope);
        var conflict = custom.FirstOrDefault(query => builtinNames.Contains(query.Name));
        if (conflict is not null)
            throw new InvalidDataException(
                $"Custom query request '{conflict.Name}' cannot replace a built-in request.");

        return builtin.Concat(custom)
            .Where(query => string.Equals(query.DomainId, domainId, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    public QueryDto? Get(string projectId, string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        var scope = Scope(projectId);
        return Builtins(scope).FirstOrDefault(query =>
                string.Equals(query.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? Find(scope, id);
    }

    public QueryDto Create(string projectId, QueryDto query)
    {
        query = NormalizeQuery(query);
        ValidateQuery(query);
        var scope = Scope(projectId);
        EnsureNameIsAvailable(scope, query.Name, currentId: null);
        var created = query with
        {
            Id = repository.CreateId(scope),
            IsBuiltin = false
        };
        Store(scope, created);
        return created;
    }

    public QueryDto? Update(string projectId, string id, QueryDto query)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        query = NormalizeQuery(query);
        ValidateQuery(query);
        if (!string.Equals(query.Id, id, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Query request ID must match the requested ID.", nameof(query));
        if (IsBuiltin(projectId, id))
            throw new InvalidOperationException($"Built-in query request '{id}' cannot be changed.");

        var scope = Scope(projectId);
        if (Find(scope, id) is null)
            return null;

        EnsureNameIsAvailable(scope, query.Name, id);
        var updated = query with { IsBuiltin = false };
        Store(scope, updated);
        return updated;
    }

    public bool IsBuiltin(string projectId, string id)
        => Builtins(Scope(projectId)).Any(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));

    public bool Delete(string projectId, string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return !IsBuiltin(projectId, id) && repository.Delete(Scope(projectId), id);
    }

    private void EnsureNameIsAvailable(StorageScope scope, string name, string? currentId)
    {
        if (Builtins(scope).Any(item =>
            string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in query request '{name}' cannot be replaced.");

        if (UserDefined(scope).Any(item =>
            !string.Equals(item.Id, currentId, StringComparison.OrdinalIgnoreCase)
            && string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A query request named '{name}' already exists.");
    }

    private IReadOnlyList<QueryDto> Builtins(StorageScope scope)
        => AllQueries(scope).Where(query => query.IsBuiltin).ToArray();

    private IReadOnlyList<QueryDto> UserDefined(StorageScope scope)
        => AllQueries(scope).Where(query => !query.IsBuiltin).ToArray();

    private IReadOnlyList<QueryDto> AllQueries(StorageScope scope)
        => repository.GetAll(scope).Select(QueryRequestCodec.Parse).ToArray();

    private QueryDto? Find(StorageScope scope, string id)
        => repository.Get(scope, id) is { } record ? QueryRequestCodec.Parse(record) : null;

    private void Store(StorageScope scope, QueryDto query)
        => repository.Save(scope, QueryRequestCodec.ToRecord(query));

    private StorageScope Scope(string projectId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(projectId);
        return new StorageScope(userSectionManager.GetSectionId(), projectId);
    }

    private static void ValidateQuery(QueryDto query)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Entity);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.DomainId);
        ArgumentNullException.ThrowIfNull(query.Projections);
        QueryDefinitionJsonParser.ValidateContextReferences(query);
    }

    private QueryDto NormalizeQuery(QueryDto query)
    {
        ArgumentNullException.ThrowIfNull(query);
        if (string.IsNullOrWhiteSpace(query.RawText))
            return query;

        // Saving keeps whatever text the user typed; text that does not parse (for example, comments only)
        // is stored with the submitted definition instead of being rejected.
        QueryDefinition parsed;
        try
        {
            parsed = dynamicQueryService.ParseQueryRequestString(query.RawText);
        }
        catch (FormatException)
        {
            return query;
        }

        return new QueryDto(parsed.Entity)
        {
            Id = query.Id,
            Name = query.Name,
            DomainId = query.DomainId,
            RawText = query.RawText,
            IsBuiltin = query.IsBuiltin,
            Projections = parsed.Projections,
            Filter = parsed.Filter,
            Sorts = parsed.Sorts,
            Take = parsed.Take,
            Skip = parsed.Skip,
            Joins = parsed.Joins,
            Contexts = parsed.Contexts,
        };
    }
}
