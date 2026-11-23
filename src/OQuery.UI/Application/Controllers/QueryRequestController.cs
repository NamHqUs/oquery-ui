using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("query-request")]
public sealed class QueryRequestController(IQueryRequestService queryRequestService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<QueryDto>> List([FromQuery] string projectId, [FromQuery] string domainId = "All")
        => Ok(queryRequestService.List(projectId, domainId));

    [HttpGet("{id}")]
    public ActionResult<QueryDto> GetById([FromRoute] string id, [FromQuery] string projectId)
    {
        var query = queryRequestService.Get(projectId, id);
        return query is null ? NotFound() : Ok(query);
    }

    [HttpPost]
    public ActionResult<QueryDto> Create([FromBody] QueryDto query, [FromQuery] string projectId)
    {
        try
        {
            var created = queryRequestService.Create(projectId, query);
            return CreatedAtAction(nameof(GetById), new { id = created.Id, projectId }, created);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (FormatException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpPut("{id}")]
    public ActionResult<QueryDto> Update([FromRoute] string id, [FromBody] QueryDto query, [FromQuery] string projectId)
    {
        try
        {
            var updated = queryRequestService.Update(projectId, id, query);
            if (updated is null) return NotFound();
            return Ok(updated);
        }
        catch (ArgumentException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (FormatException exception)
        {
            return BadRequest(exception.Message);
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpDelete("{id}")]
    public IActionResult Delete([FromRoute] string id, [FromQuery] string projectId)
    {
        var deleted = queryRequestService.Delete(projectId, id);
        if (deleted) return NoContent();
        return queryRequestService.IsBuiltin(projectId, id)
            ? Conflict("Built-in query requests cannot be deleted.")
            : NotFound();
    }
}
