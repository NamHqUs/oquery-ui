using OQuery.UI.Abstracts.Services;
using OQuery.UI.Abstracts.Dto;
using OQuery.Database;
using OQuery.UI.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Data.Common;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("db")]
public sealed class DatabaseController(
    IDatabaseService databaseService,
    IDbConnectionService connectionService,
    IOptions<OQueryOptions> options,
    ILogger<DatabaseController> logger) : ControllerBase
{
    [HttpGet("connections")]
    public ActionResult<DatabaseConnectionOptionsDto> GetConnections()
        => Ok(connectionService.GetConnectionOptions());

    [HttpGet("connections/provider")]
    public ActionResult<string?> GetDbProvider()
        => new JsonResult(connectionService.GetCurrentProvider());

    [HttpPut("connection")]
    public ActionResult<DatabaseConnectionResponseDto> UpdateDbConnection(
        [FromBody] DatabaseConnectionRequestDto request)
    {
        if (!options.Value.DbProvider.AllowDirectConnection)
        {
            return Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Direct database connection is disabled",
                detail: "Set 'OQuery:DbProvider:AllowDirectConnection' to true to allow connecting to a new database.");
        }

        try
        {
            connectionService.UpdateDbConnection(request.Provider, request.ConnectionString);
            return Ok(new DatabaseConnectionResponseDto(request.Provider));
        }
        catch (ArgumentException exception)
        {
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid database connection",
                detail: exception.Message);
        }
        catch (DbException exception)
        {
            logger.LogWarning(
                "Database connection attempt failed ({ExceptionType}).",
                exception.GetType().Name);
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Database connection failed",
                detail: "The server could not establish the connection. Check the provider, endpoint, credentials, and network access.");
        }
    }

    [HttpPost("disconnect")]
    public IActionResult Disconnect()
    {
        connectionService.Disconnect();
        return NoContent();
    }

    [HttpGet("schema")]
    public ActionResult<DatabaseSchema> GetSchema() => Ok(databaseService.GetDatabaseSchema());

    [HttpGet("data/{tableName}")]
    public ActionResult<DatabaseTableData> GetTableData(
        string tableName,
        [FromQuery] string? schema = null,
        [FromQuery] int? limit = null)
        => Ok(databaseService.GetTableData(tableName, schema, limit));
}
