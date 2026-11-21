using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Abstracts.Services;

public interface IProjectService
{
    IReadOnlyList<ProjectFileDto> GetAll();
    ProjectDto GetById(string projectId);
    ProjectDto Create(ProjectFileDto project);

    /// <summary>Creates a project, its encrypted connection, the FullDomain and the Main domain from one database. Nothing is kept on failure.</summary>
    ProjectDto CreateFromDatabase(ProjectFromDatabaseRequestDto request);
    ProjectDto Update(string projectId, ProjectFileDto project);
    void Delete(string projectId);

    /// <summary>Reads the database schema and stores it as the project's FullDomain.</summary>
    FullDomainDto GenerateFullDomain(string projectId);
    FullDomainDto GetFullDomain(string projectId);

    /// <summary>Saves the edited FullDomain (field and relation mappings to database columns). Existing sub-domains must still resolve.</summary>
    FullDomainDto UpdateFullDomain(string projectId, FullDomainDto fullDomain);

    IReadOnlyList<DomainNameDto> GetDomainNames(string projectId);
    DomainDto GetDomain(string projectId, string domainId);
    DomainDto CreateDomain(string projectId, DomainDto domain);
    DomainDto UpdateDomain(string projectId, string domainId, DomainDto domain);
    void DeleteDomain(string projectId, string domainId);

    /// <summary>Resolves the metadata a query runs against: FullDomain with the sub-domain overrides applied.</summary>
    IReadOnlyList<OQuery.Entity> ResolveMetadata(string projectId, string domainId);

    /// <summary>The resolved sub-domain as the UI shows it: entities and relations with overrides applied.</summary>
    FullDomainDto GetResolvedDomain(string projectId, string domainId);
}
