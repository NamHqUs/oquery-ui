using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;

namespace OQuery.UI.Services;

public sealed class PlaygroundService(
    IPlaygroundRepository repository,
    IUserSectionManager userSectionManager) : IPlaygroundService
{
    public IReadOnlyList<PlaygroundDto> List(string projectId, string domainId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(domainId);
        return repository.GetAll(Scope(projectId), domainId).ToArray();
    }

    public PlaygroundDto? Get(string projectId, string domainId, string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(domainId);
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return repository.Get(Scope(projectId), domainId, id);
    }

    public PlaygroundDto Create(string projectId, PlaygroundDto playground)
    {
        ArgumentNullException.ThrowIfNull(playground);
        ArgumentException.ThrowIfNullOrWhiteSpace(playground.DomainId);
        var scope = Scope(projectId);
        var created = playground with { Id = repository.CreateId(scope, playground.DomainId) };
        repository.Save(scope, created);
        return created;
    }

    public PlaygroundDto? Update(string projectId, string id, PlaygroundDto playground)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentNullException.ThrowIfNull(playground);
        ArgumentException.ThrowIfNullOrWhiteSpace(playground.DomainId);
        var scope = Scope(projectId);
        if (repository.Get(scope, playground.DomainId, id) is null)
            return null;

        var updated = playground with { Id = id };
        repository.Save(scope, updated);
        return updated;
    }

    public bool Delete(string projectId, string domainId, string id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(domainId);
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        return repository.Delete(Scope(projectId), domainId, id);
    }

    private StorageScope Scope(string projectId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(projectId);
        return new StorageScope(userSectionManager.GetSectionId(), projectId);
    }
}
