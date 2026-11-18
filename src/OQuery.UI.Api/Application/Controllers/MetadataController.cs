using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;
using Microsoft.AspNetCore.Mvc;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata")]
public sealed class MetadataController(
    IDomainService domainService,
    IFunctionDefinitionService functionDefinitionService) : ControllerBase
{
    [HttpGet("domains/names")]
    public ActionResult<IReadOnlyList<DomainNameDto>> GetDomainNames()
        => Ok(domainService.GetAllDomainNames());

    [HttpGet("domains/names-with-descriptions")]
    public ActionResult<IReadOnlyList<DomainNameWithDescriptionDto>> GetDomainNamesWithDescriptions()
        => Ok(domainService.GetAllDomainNameWithDescriptions());

    [HttpGet("domains/{domainId}")]
    public ActionResult<DomainDto> GetDomain(string domainId)
        => Ok(domainService.GetById(domainId));

    [HttpPost("domains")]
    public ActionResult<DomainDto> CreateDomain([FromBody] DomainDto scope)
    {
        var created = domainService.Create(scope);
        return Created($"/metadata/domains/{Uri.EscapeDataString(created.Id)}", created);
    }

    [HttpPost("domains/generate")]
    public ActionResult<DomainDto> GenerateDomain([FromBody] DomainGenerationRequestDto request)
    {
        var created = domainService.Generate(request);
        return Created($"/metadata/domains/{Uri.EscapeDataString(created.Id)}", created);
    }

    [HttpPut("domains/{domainId}")]
    public ActionResult<DomainDto> UpdateDomain(string domainId, [FromBody] DomainDto scope)
        => Ok(domainService.Update(domainId, scope));

    [HttpDelete("domains/{domainId}")]
    public IActionResult DeleteDomain(string domainId)
    {
        domainService.Delete(domainId);
        return NoContent();
    }

    [HttpGet("functions")]
    public ActionResult<IReadOnlyList<FunctionDefinitionDto>> GetFunctionDefinitions()
        => Ok(functionDefinitionService.GetAll());

    [HttpPost("functions")]
    public ActionResult<FunctionDefinitionDto> CreateFunctionDefinition([FromBody] FunctionDefinitionDto definition)
        => Created($"/metadata/functions/{Uri.EscapeDataString(definition.Name)}",
            functionDefinitionService.Create(definition));

    [HttpPut("functions/{functionName}")]
    public ActionResult<FunctionDefinitionDto> UpdateFunctionDefinition(
        string functionName,
        [FromBody] FunctionDefinitionDto definition)
        => Ok(functionDefinitionService.Update(functionName, definition));

    [HttpDelete("functions/{functionName}")]
    public IActionResult DeleteFunctionDefinition(string functionName)
    {
        functionDefinitionService.Delete(functionName);
        return NoContent();
    }
}
