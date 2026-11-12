using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;
using OQuery;
using System.Text;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("dynamic-query/query")]
public sealed class DynamicQueryController(
    IDynamicQueryService dynamicQueryService) : ControllerBase
{
    [HttpPost("to-string")]
    public IActionResult GetSqlQueryString(
        [FromBody] QueryDefinition query,
        [FromQuery] string domainId)
        => Content(dynamicQueryService.GetSqlQueryString(query, domainId), "text/plain");

    [HttpPost("to-oquery")]
    public IActionResult GetQueryRequestString([FromBody] QueryDefinition query)
        => Content(dynamicQueryService.GetQueryRequestString(query), "text/plain");

    [HttpPost("from-oquery")]
    public IActionResult ParseQueryRequest([FromBody] OQueryTextRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
            return BadRequest("Request text is required.");

        return Ok(dynamicQueryService.ParseQueryRequestString(request.Text));
    }

    [HttpPost]
    public async Task<IActionResult> ExecuteQuery(
        [FromBody] QueryDefinition query,
        [FromQuery] string domainId,
        CancellationToken cancellationToken)
        => Ok(await dynamicQueryService.ExecuteQueryAsync(query, domainId, cancellationToken));

    [HttpPost("to-string-from-text")]
    public async Task<IActionResult> GetSqlQueryStringFromText(
        [FromQuery] string domainId,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var text = await reader.ReadToEndAsync(cancellationToken);
        var query = dynamicQueryService.ParseQueryRequestString(text);
        return Content(dynamicQueryService.GetSqlQueryString(query, domainId), "text/plain");
    }

    [HttpPost("from-text")]
    public async Task<IActionResult> ExecuteQueryFromText(
        [FromQuery] string domainId,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var text = await reader.ReadToEndAsync(cancellationToken);
        var query = dynamicQueryService.ParseQueryRequestString(text);
        return Ok(await dynamicQueryService.ExecuteQueryAsync(query, domainId, cancellationToken));
    }

    [HttpPost("from-text/{contextName}")]
    public async Task<IActionResult> ExecuteContextFromText(
        [FromRoute] string contextName,
        [FromQuery] string domainId,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var text = await reader.ReadToEndAsync(cancellationToken);
        return Ok(await dynamicQueryService.ExecuteContextQueryAsync(text, contextName, domainId, cancellationToken));
    }


    public sealed record OQueryTextRequest(string? Text);
}
