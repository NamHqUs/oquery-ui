using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("query-request")]
public sealed class QueryRequestController(IQueryRequestService queryRequestService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<QueryDto>> List()
        => Ok(queryRequestService.List());

    [HttpGet("{id}")]
    public ActionResult<QueryDto> GetById([FromRoute] string id)
    {
        var query = queryRequestService.Get(id);
        return query is null ? NotFound() : Ok(query);
    }

    [HttpPost]
    public ActionResult<QueryDto> Create([FromBody] QueryDto query)
    {
        try
        {
            var created = queryRequestService.Create(query);
            return CreatedAtAction(nameof(GetById), new { id = created.MainQuery.Id }, created);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpPut("{id}")]
    public ActionResult<QueryDto> Update([FromRoute] string id, [FromBody] QueryDto query)
    {
        try
        {
            var updated = queryRequestService.Update(id, query);
            if (updated is null) return NotFound();
            return Ok(updated);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpDelete("{id}")]
    public IActionResult Delete([FromRoute] string id)
    {
        var deleted = queryRequestService.Delete(id);
        if (deleted) return NoContent();
        return queryRequestService.IsBuiltin(id)
            ? Conflict("Built-in query requests cannot be deleted.")
            : NotFound();
    }
}
