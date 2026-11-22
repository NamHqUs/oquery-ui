using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Repositories;

/// <summary>
/// Stores each project as a folder named by its ID: project.json and one file per domain.
/// Queries and functions are stored in the same folder through their own repositories.
/// </summary>
public interface IProjectRepository
{
    IReadOnlyList<ProjectFileDto> GetAll(string userSectionId);
    ProjectFileDto? Get(string userSectionId, string projectId);
    string CreateId(string userSectionId);
    void Save(string userSectionId, ProjectFileDto project);
    bool Delete(string userSectionId, string projectId);

    IReadOnlyList<DomainDto> GetDomains(string userSectionId, string projectId);
    DomainDto? GetDomain(string userSectionId, string projectId, string domainId);
    void SaveDomain(string userSectionId, string projectId, DomainDto domain);
    bool DeleteDomain(string userSectionId, string projectId, string domainId);
}
