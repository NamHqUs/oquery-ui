using OQuery.UI.Abstracts.Services;
using OQuery.UI.Abstracts.Dto;
using OQuery.Database;
using Microsoft.AspNetCore.Mvc;
using System.Data.Common;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("db")]
public sealed class DatabaseController(
    IDatabaseService databaseService,
    IDbConnectionService connectionService,
    IConfiguration configuration,
    ILogger<DatabaseController> logger) : ControllerBase
{
    private const string AllowDirectConnectionKey = "OQuery:DbProvider:AllowDirectConnection";

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
        if (!configuration.GetValue(AllowDirectConnectionKey, true))
        {
            return Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Direct database connection is disabled",
                detail: $"Set '{AllowDirectConnectionKey}' to true to allow connecting to a new database.");
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
    public ActionResult<DatabaseSchemaDto> GetSchema() => Ok(databaseService.GetDatabaseSchema());

    [HttpGet("data/{tableName}")]
    public ActionResult<DatabaseTableDataDto> GetTableData(
        string tableName,
        [FromQuery] string? schema = null,
        [FromQuery] int? limit = null)
        => Ok(databaseService.GetTableData(tableName, schema, limit));
}
