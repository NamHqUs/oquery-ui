using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

/// <summary>Saved playgrounds, one folder per domain: projects/{projectId}/{domainId}/playground/.</summary>
public interface IPlaygroundRepository
{
    string CreateId(StorageScope scope, string domainId);
    IReadOnlyCollection<PlaygroundDto> GetAll(StorageScope scope, string domainId);
    PlaygroundDto? Get(StorageScope scope, string domainId, string id);
    void Save(StorageScope scope, PlaygroundDto playground);
    bool Delete(StorageScope scope, string domainId, string id);
}
