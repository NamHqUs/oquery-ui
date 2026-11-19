using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("version")]
public sealed class VersionController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var version = typeof(VersionController).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? typeof(VersionController).Assembly.GetName().Version?.ToString();

        return Ok(new
        {
            version,
            // Set automatically by Render for git-backed services.
            commit = Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT"),
        });
    }
}
