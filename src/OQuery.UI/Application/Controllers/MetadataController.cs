using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;
using OQuery;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata")]
public sealed class MetadataController(
    IMetadataService metadataService,
    IFunctionDefinitionService functionDefinitionService,
    IOperatorDefinitionService operatorDefinitionService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<MetadataEntityDto>> GetMetadata() => Ok(metadataService.GetAll());

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
