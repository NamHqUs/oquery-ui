using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery.QueryDefinitions.Parsers;

namespace Demo.Services;

public sealed class QueryRequestService(
    IQueryRequestRepository repository,
    IUserSectionManager userSectionManager) : IQueryRequestService
{
    public IReadOnlyList<QueryDto> List()
    {
        var sectionId = userSectionManager.GetSectionId();
        var builtin = repository.GetBuiltin();
        var builtinNames = builtin.Select(query => query.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var custom = repository.GetUserDefined(sectionId);
        var conflict = custom.FirstOrDefault(query => builtinNames.Contains(query.Name));
        if (conflict is not null)
            throw new InvalidDataException(
                $"Custom query request '{conflict.Name}' cannot replace a built-in request.");

        return builtin.Concat(custom).ToArray();
    }

    public QueryDto? Get(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return repository.GetBuiltin().FirstOrDefault(query =>
                string.Equals(query.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? repository.Get(userSectionManager.GetSectionId(), id);
    }

    public QueryDto Create(QueryDto query)
    {
        ValidateQuery(query);
        var sectionId = userSectionManager.GetSectionId();
        EnsureNameIsAvailable(sectionId, query.Name, currentId: null);
        var created = query with
        {
            Id = repository.CreateId(sectionId),
            IsBuiltin = false
        };
        repository.Save(sectionId, created);
        return created;
    }

    public QueryDto? Update(string id, QueryDto query)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ValidateQuery(query);
        if (!string.Equals(query.Id, id, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Query request ID must match the requested ID.", nameof(query));
        if (IsBuiltin(id))
            throw new InvalidOperationException($"Built-in query request '{id}' cannot be changed.");

        var sectionId = userSectionManager.GetSectionId();
        if (repository.Get(sectionId, id) is null)
            return null;

        EnsureNameIsAvailable(sectionId, query.Name, id);
        var updated = query with { IsBuiltin = false };
        repository.Save(sectionId, updated);
        return updated;
    }

    public bool IsBuiltin(string id)
        => repository.GetBuiltin().Any(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));

    public bool Delete(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return !IsBuiltin(id) && repository.Delete(userSectionManager.GetSectionId(), id);
    }

    private void EnsureNameIsAvailable(string sectionId, string name, string? currentId)
    {
        if (repository.GetBuiltin().Any(item =>
            string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in query request '{name}' cannot be replaced.");

        if (repository.GetUserDefined(sectionId).Any(item =>
            !string.Equals(item.Id, currentId, StringComparison.OrdinalIgnoreCase)
            && string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A query request named '{name}' already exists.");
    }

    private static void ValidateQuery(QueryDto query)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Entity);
        ArgumentNullException.ThrowIfNull(query.Projections);
        QueryDefinitionJsonParser.ValidateContextReferences(query);
    }
}
