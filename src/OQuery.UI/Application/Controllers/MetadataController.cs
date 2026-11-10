using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;
using OQuery;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata")]
public sealed class MetadataController(
    IMetadataService metadataService,
    IBusinessScopeService businessScopeService,
    IFunctionDefinitionService functionDefinitionService,
    IOperatorDefinitionService operatorDefinitionService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<MetadataEntityDto>> GetMetadata([FromQuery] string? scope)
        => Ok(businessScopeService.GetEntities(scope));

    [HttpPost]
    public ActionResult<Entity> CreateMetadata([FromBody] Entity entity)
        => Ok(metadataService.Create(entity));

    [HttpPost("reset")]
    public ActionResult<IReadOnlyList<Entity>> Reset()
        => Ok(metadataService.Reset());

    [HttpPut("{entityName}")]
    public ActionResult<Entity> UpdateMetadata(string entityName, [FromBody] Entity entity)
        => Ok(metadataService.Update(entityName, entity));

    [HttpDelete("{entityName}")]
    public IActionResult DeleteMetadata(string entityName)
    {
        metadataService.Delete(entityName);
        return NoContent();
    }

    [HttpGet("business-scopes")]
    public ActionResult<IReadOnlyList<BusinessScopeDto>> GetBusinessScopes()
        => Ok(businessScopeService.GetAll());

    [HttpPost("business-scopes")]
    public ActionResult<BusinessScopeDto> CreateBusinessScope([FromBody] BusinessScopeDto scope)
        => Created($"/metadata/business-scopes/{Uri.EscapeDataString(scope.Name)}", businessScopeService.Create(scope));

    [HttpPost("business-scopes/generate")]
    public ActionResult<BusinessScopeDto> GenerateBusinessScope([FromBody] BusinessScopeGenerationRequestDto request)
        => Created($"/metadata/business-scopes/{Uri.EscapeDataString(request.Name)}", businessScopeService.Generate(request));

    [HttpPut("business-scopes/{scopeName}")]
    public ActionResult<BusinessScopeDto> UpdateBusinessScope(string scopeName, [FromBody] BusinessScopeDto scope)
        => Ok(businessScopeService.Update(scopeName, scope));

    [HttpDelete("business-scopes/{scopeName}")]
    public IActionResult DeleteBusinessScope(string scopeName)
    {
        businessScopeService.Delete(scopeName);
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
