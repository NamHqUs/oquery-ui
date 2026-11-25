using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata/projects")]
public sealed class MetadataController(
    IProjectService projectService,
    ILogger<MetadataController> logger) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<ProjectFileDto>> GetProjects()
        => Ok(projectService.GetAll());

    [HttpPost]
    public ActionResult<ProjectDto> CreateProject([FromBody] ProjectFileDto project)
    {
        var created = projectService.Create(project);
        return Created($"/metadata/projects/{Uri.EscapeDataString(created.Id)}", created);
    }

    [HttpPost("from-database")]
    public ActionResult<ProjectDto> CreateProjectFromDatabase([FromBody] ProjectFromDatabaseRequestDto request)
    {
        try
        {
            var created = projectService.CreateFromDatabase(request);
            return Created($"/metadata/projects/{Uri.EscapeDataString(created.Id)}", created);
        }
        catch (Exception exception)
        {
            logger.LogWarning("Create project from database failed ({ExceptionType}).", exception.GetType().Name);
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Create project failed",
                detail: exception.Message);
        }
    }

    [HttpPost("import")]
    public ActionResult<ProjectDto> ImportProject([FromBody] ProjectImportDto request)
    {
        try
        {
            var imported = projectService.Import(request);
            return Created($"/metadata/projects/{Uri.EscapeDataString(imported.Id)}", imported);
        }
        catch (Exception exception)
        {
            logger.LogWarning("Import project failed ({ExceptionType}).", exception.GetType().Name);
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Import project failed",
                detail: exception.Message);
        }
    }

    [HttpGet("{projectId}")]
    public ActionResult<ProjectDto> GetProject(string projectId)
        => Ok(projectService.GetById(projectId));

    [HttpPut("{projectId}")]
    public ActionResult<ProjectDto> UpdateProject(string projectId, [FromBody] ProjectFileDto project)
        => Ok(projectService.Update(projectId, project));

    [HttpDelete("{projectId}")]
    public IActionResult DeleteProject(string projectId)
    {
        projectService.Delete(projectId);
        return NoContent();
    }

    [HttpGet("{projectId}/domains/names")]
    public ActionResult<IReadOnlyList<DomainNameDto>> GetDomainNames(string projectId)
        => Ok(projectService.GetDomainNames(projectId));

    [HttpGet("{projectId}/domains/{domainId}")]
    public ActionResult<DomainDto> GetDomain(string projectId, string domainId)
        => Ok(projectService.GetDomain(projectId, domainId));

    [HttpPost("{projectId}/domains")]
    public ActionResult<DomainDto> CreateDomain(string projectId, [FromBody] DomainDto domain)
    {
        var created = projectService.CreateDomain(projectId, domain);
        return Created($"/metadata/projects/{Uri.EscapeDataString(projectId)}/domains/{Uri.EscapeDataString(created.Id)}", created);
    }

    [HttpPut("{projectId}/domains/{domainId}")]
    public ActionResult<DomainDto> UpdateDomain(string projectId, string domainId, [FromBody] DomainDto domain)
        => Ok(projectService.UpdateDomain(projectId, domainId, domain));

    [HttpDelete("{projectId}/domains/{domainId}")]
    public IActionResult DeleteDomain(string projectId, string domainId)
    {
        projectService.DeleteDomain(projectId, domainId);
        return NoContent();
    }
}
