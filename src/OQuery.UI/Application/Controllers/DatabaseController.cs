using Demo.Contracts.Services;
using Demo.Contracts.Dto;
using Microsoft.AspNetCore.Mvc;
using System.Data.Common;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("db")]
public sealed class DatabaseController(
    IDatabaseService databaseService,
    IDbConnectionService connectionService,
    ILogger<DatabaseController> logger) : ControllerBase
{
    [HttpGet("connections")]
    public ActionResult<DatabaseConnectionOptionsDto> GetConnections()
        => Ok(connectionService.GetConnectionOptions());

    [HttpGet("connections/provider")]
    public ActionResult<string?> GetDbProvider()
        => new JsonResult(connectionService.GetCurrentProvider());

    [HttpPost("connect")]
    public ActionResult<DatabaseConnectionResponseDto> Connect(
        [FromBody] DatabaseConnectionRequestDto request)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(request.Profile))
            {
                if (!string.IsNullOrWhiteSpace(request.Provider)
                    || !string.IsNullOrWhiteSpace(request.ConnectionString))
                    throw new ArgumentException("Select a profile or provide a direct connection, not both.", nameof(request));

                var provider = connectionService.Connect(request.Profile);
                return Ok(new DatabaseConnectionResponseDto(provider, request.Profile));
            }

            if (string.IsNullOrWhiteSpace(request.Provider)
                || string.IsNullOrWhiteSpace(request.ConnectionString))
                throw new ArgumentException("A profile or both provider and connection string are required.", nameof(request));

            connectionService.Connect(request.Provider, request.ConnectionString);
            return Ok(new DatabaseConnectionResponseDto(request.Provider, null));
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

    [HttpGet("tables")]
    public ActionResult<string[]> GetTables() => Ok(databaseService.GetTableNames());

    [HttpGet("schema")]
    public ActionResult<DatabaseSchemaDto> GetSchema() => Ok(databaseService.GetDatabaseSchema());

    [HttpGet("data/{tableName}")]
    public ActionResult<DatabaseTableDataDto> GetTableData(
        string tableName,
        [FromQuery] string? schema = null,
        [FromQuery] int? limit = null)
        => Ok(databaseService.GetTableData(tableName, schema, limit));
}
