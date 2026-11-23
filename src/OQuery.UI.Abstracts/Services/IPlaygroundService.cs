using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IPlaygroundService
{
    IReadOnlyList<PlaygroundDto> List(string projectId, string domainId);
    PlaygroundDto? Get(string projectId, string domainId, string id);
    PlaygroundDto Create(string projectId, PlaygroundDto playground);
    PlaygroundDto? Update(string projectId, string id, PlaygroundDto playground);
    bool Delete(string projectId, string domainId, string id);
}
