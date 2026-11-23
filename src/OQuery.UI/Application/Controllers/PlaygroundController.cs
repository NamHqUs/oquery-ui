using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Services;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("playgrounds")]
public sealed class PlaygroundController(IPlaygroundService playgroundService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<PlaygroundDto>> List([FromQuery] string projectId, [FromQuery] string domainId)
        => Ok(playgroundService.List(projectId, domainId));

    [HttpGet("{id}")]
    public ActionResult<PlaygroundDto> GetById([FromRoute] string id, [FromQuery] string projectId, [FromQuery] string domainId)
    {
        var playground = playgroundService.Get(projectId, domainId, id);
        return playground is null ? NotFound() : Ok(playground);
    }

    [HttpPost]
    public ActionResult<PlaygroundDto> Create([FromBody] PlaygroundDto playground, [FromQuery] string projectId)
    {
        var created = playgroundService.Create(projectId, playground);
        return CreatedAtAction(nameof(GetById), new { id = created.Id, projectId, domainId = created.DomainId }, created);
    }

    [HttpPut("{id}")]
    public ActionResult<PlaygroundDto> Update([FromRoute] string id, [FromBody] PlaygroundDto playground, [FromQuery] string projectId)
    {
        var updated = playgroundService.Update(projectId, id, playground);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete([FromRoute] string id, [FromQuery] string projectId, [FromQuery] string domainId)
        => playgroundService.Delete(projectId, domainId, id) ? NoContent() : NotFound();
}
