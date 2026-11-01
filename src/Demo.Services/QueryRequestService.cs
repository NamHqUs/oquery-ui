using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;

namespace Demo.Services;

public sealed class QueryRequestService(
    IQueryRequestRepository repository,
    IUserSectionManager userSectionManager) : IQueryRequestService
{
    public IReadOnlyList<QueryDto> List()
    {
        var sectionId = userSectionManager.GetSectionId();
        var builtin = repository.GetBuiltin();
        var builtinNames = builtin.Select(query => query.MainQuery.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var custom = repository.GetUserDefined(sectionId);
        var conflict = custom.FirstOrDefault(query => builtinNames.Contains(query.MainQuery.Name));
        if (conflict is not null)
            throw new InvalidDataException(
                $"Custom query request '{conflict.MainQuery.Name}' cannot replace a built-in request.");

        return builtin.Concat(custom).ToArray();
    }

    public QueryDto? Get(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return repository.GetBuiltin().FirstOrDefault(query =>
                string.Equals(query.MainQuery.Id, id, StringComparison.OrdinalIgnoreCase))
            ?? repository.Get(userSectionManager.GetSectionId(), id);
    }

    public QueryDto Create(QueryDto query)
    {
        ValidateQuery(query);
        var sectionId = userSectionManager.GetSectionId();
        EnsureNameIsAvailable(sectionId, query.MainQuery.Name, currentId: null);
        var created = query with
        {
            MainQuery = query.MainQuery with { Id = repository.CreateId(sectionId) },
            IsBuiltin = false
        };
        repository.Save(sectionId, created);
        return created;
    }

    public QueryDto? Update(string id, QueryDto query)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ValidateQuery(query);
        if (!string.Equals(query.MainQuery.Id, id, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Query context ID must match the requested ID.", nameof(query));
        if (IsBuiltin(id))
            throw new InvalidOperationException($"Built-in query request '{id}' cannot be changed.");

        var sectionId = userSectionManager.GetSectionId();
        if (repository.Get(sectionId, id) is null)
            return null;

        EnsureNameIsAvailable(sectionId, query.MainQuery.Name, id);
        var updated = query with { IsBuiltin = false };
        repository.Save(sectionId, updated);
        return updated;
    }

    public bool IsBuiltin(string id)
        => repository.GetBuiltin().Any(item =>
            string.Equals(item.MainQuery.Id, id, StringComparison.OrdinalIgnoreCase));

    public bool Delete(string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return !IsBuiltin(id) && repository.Delete(userSectionManager.GetSectionId(), id);
    }

    private void EnsureNameIsAvailable(string sectionId, string name, string? currentId)
    {
        if (repository.GetBuiltin().Any(item =>
            string.Equals(item.MainQuery.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in query request '{name}' cannot be replaced.");

        if (repository.GetUserDefined(sectionId).Any(item =>
            !string.Equals(item.MainQuery.Id, currentId, StringComparison.OrdinalIgnoreCase)
            && string.Equals(item.MainQuery.Name, name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A query request named '{name}' already exists.");
    }

    private static void ValidateQuery(QueryDto query)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentNullException.ThrowIfNull(query.MainQuery);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.MainQuery.Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.MainQuery.Entity);
        ArgumentNullException.ThrowIfNull(query.MainQuery.Projection);
    }
}
