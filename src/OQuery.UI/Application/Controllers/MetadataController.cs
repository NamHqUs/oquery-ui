using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;
using Microsoft.AspNetCore.Mvc;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata/projects")]
public sealed class MetadataController(
    IProjectService projectService,
    IFunctionDefinitionService functionDefinitionService,
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

    [HttpPost("{projectId}/full-domain/generate")]
    public ActionResult<FullDomainDto> GenerateFullDomain(string projectId)
        => Ok(projectService.GenerateFullDomain(projectId));

    [HttpGet("{projectId}/full-domain")]
    public ActionResult<FullDomainDto> GetFullDomain(string projectId)
        => Ok(projectService.GetFullDomain(projectId));

    [HttpGet("{projectId}/domains/names")]
    public ActionResult<IReadOnlyList<DomainNameDto>> GetDomainNames(string projectId)
        => Ok(projectService.GetDomainNames(projectId));

    [HttpGet("{projectId}/domains/{domainId}")]
    public ActionResult<DomainDto> GetDomain(string projectId, string domainId)
        => Ok(projectService.GetDomain(projectId, domainId));

    [HttpGet("{projectId}/domains/{domainId}/resolved")]
    public ActionResult<FullDomainDto> GetResolvedDomain(string projectId, string domainId)
        => Ok(projectService.GetResolvedDomain(projectId, domainId));

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

    [HttpGet("{projectId}/functions")]
    public ActionResult<IReadOnlyList<FunctionDefinitionDto>> GetFunctionDefinitions(string projectId)
        => Ok(functionDefinitionService.GetAll(projectId));

    [HttpPost("{projectId}/functions")]
    public ActionResult<FunctionDefinitionDto> CreateFunctionDefinition(
        string projectId,
        [FromBody] FunctionDefinitionDto definition)
        => Created($"/metadata/projects/{Uri.EscapeDataString(projectId)}/functions/{Uri.EscapeDataString(definition.Name)}",
            functionDefinitionService.Create(projectId, definition));

    [HttpPut("{projectId}/functions/{functionName}")]
    public ActionResult<FunctionDefinitionDto> UpdateFunctionDefinition(
        string projectId,
        string functionName,
        [FromBody] FunctionDefinitionDto definition)
        => Ok(functionDefinitionService.Update(projectId, functionName, definition));

    [HttpDelete("{projectId}/functions/{functionName}")]
    public IActionResult DeleteFunctionDefinition(string projectId, string functionName)
    {
        functionDefinitionService.Delete(projectId, functionName);
        return NoContent();
    }
}
