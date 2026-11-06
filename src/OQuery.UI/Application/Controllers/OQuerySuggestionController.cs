using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("oquery/suggestions")]
public sealed class OQuerySuggestionController(
    IOQuerySuggestionService suggestionService) : ControllerBase
{
    [HttpPost]
    public ActionResult<OQuerySuggestionResponse> GetSuggestions(
        [FromBody] OQuerySuggestionRequest request)
    {
        if (request is null || request.Line < 1 || request.Column < 1)
            return BadRequest("A positive cursor line and column are required.");

        return Ok(suggestionService.GetSuggestions(request));
    }
}
