using Microsoft.AspNetCore.Mvc;

namespace OQuery.UI.Application.Controllers;

[ApiController]
public sealed class HomeController : ControllerBase
{
    [HttpGet("/")]
    public IActionResult Get() => Content("Dynamic SQL Demo. /swagger to open Swagger UI");
}
