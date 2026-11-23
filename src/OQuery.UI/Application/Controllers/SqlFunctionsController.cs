using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("metadata/sqlfunctions")]
public sealed class SqlFunctionsController(IFunctionDefinitionService functionDefinitionService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<FunctionDefinitionDto>> GetFunctionDefinitions()
        => Ok(functionDefinitionService.GetAll());

    [HttpPost]
    public ActionResult<FunctionDefinitionDto> CreateFunctionDefinition([FromBody] FunctionDefinitionDto definition)
    {
        var created = functionDefinitionService.Create(definition);
        return Created($"/metadata/sqlfunctions/{Uri.EscapeDataString(created.Name)}", created);
    }

    [HttpPut("{functionName}")]
    public ActionResult<FunctionDefinitionDto> UpdateFunctionDefinition(
        string functionName,
        [FromBody] FunctionDefinitionDto definition)
        => Ok(functionDefinitionService.Update(functionName, definition));

    [HttpDelete("{functionName}")]
    public IActionResult DeleteFunctionDefinition(string functionName)
    {
        functionDefinitionService.Delete(functionName);
        return NoContent();
    }
}
