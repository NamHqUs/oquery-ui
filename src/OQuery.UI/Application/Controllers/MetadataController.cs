using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;
using OQuery;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata")]
public sealed class MetadataController(
    IMetadataService metadataService,
    IDomainService domainService,
    IFunctionDefinitionService functionDefinitionService,
    IOperatorDefinitionService operatorDefinitionService) : ControllerBase
{
    [HttpPost("reset")]
    public ActionResult<IReadOnlyList<Entity>> Reset()
        => Ok(metadataService.Reset());

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

    [HttpGet("operators")]
    public ActionResult<IReadOnlyList<OperatorDefinitionDto>> GetOperatorDefinitions()
        => Ok(operatorDefinitionService.GetAll());

    [HttpPost("operators")]
    public ActionResult<OperatorDefinitionDto> CreateOperatorDefinition([FromBody] OperatorDefinitionDto definition)
        => Created($"/metadata/operators/{Uri.EscapeDataString(definition.Id)}",
            operatorDefinitionService.Create(definition));

    [HttpPut("operators/{operatorId}")]
    public ActionResult<OperatorDefinitionDto> UpdateOperatorDefinition(
        string operatorId,
        [FromBody] OperatorDefinitionDto definition)
        => Ok(operatorDefinitionService.Update(operatorId, definition));

    [HttpDelete("operators/{operatorId}")]
    public IActionResult DeleteOperatorDefinition(string operatorId)
    {
        operatorDefinitionService.Delete(operatorId);
        return NoContent();
    }
}
