using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IProjectService
{
    IReadOnlyList<ProjectFileDto> GetAll();
    ProjectDto GetById(string projectId);
    ProjectDto Create(ProjectFileDto project);

    /// <summary>Creates a project, its encrypted connection and the Main domain from one database. Nothing is kept on failure.</summary>
    ProjectDto CreateFromDatabase(ProjectFromDatabaseRequestDto request);

    /// <summary>Imports a project folder as a new project. Keeps the project ID when it is free, otherwise assigns a new one. Nothing is kept on failure.</summary>
    ProjectDto Import(ProjectImportDto request);
    ProjectDto Update(string projectId, ProjectFileDto project);
    void Delete(string projectId);

    IReadOnlyList<DomainNameDto> GetDomainNames(string projectId);
    DomainDto GetDomain(string projectId, string domainId);
    DomainDto CreateDomain(string projectId, DomainDto domain);
    DomainDto UpdateDomain(string projectId, string domainId, DomainDto domain);
    void DeleteDomain(string projectId, string domainId);

    /// <summary>Resolves the metadata a query runs against: the entities and relations of its domain.</summary>
    IReadOnlyList<OQuery.Entity> ResolveMetadata(string projectId, string domainId);
}
