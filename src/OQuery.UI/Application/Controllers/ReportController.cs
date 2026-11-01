using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using OQuery;
using System.Text.Json;

namespace OQuery.UI.Application.Controllers;

[ApiController]
[Route("report")]
public sealed class ReportController(
    IReportService reportService,
    IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions> jsonOptions) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<ReportDto>> List()
        => Ok(reportService.ListReports());

    [HttpPost("to-string")]
    public IActionResult GetQueryRequestString([FromBody] QueryDefinition query)
        => Content(reportService.GetQueryRequestString(query), "text/plain");

    [HttpPost("parse")]
    public ActionResult<QueryDefinition> Parse([FromBody] ReportTextRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Text) || string.IsNullOrWhiteSpace(request.Entity))
            return BadRequest("Request text and entity are required.");

        return Ok(reportService.ParseQueryRequestString(request.Text, request.Entity));
    }

    [HttpGet("{fileName}")]
    public ActionResult<ReportDto> Get(string fileName)
    {
        var report = reportService.GetReport(fileName);
        return report is null ? NotFound() : Ok(report);
    }

    [HttpPost]
    public ActionResult<ReportDto> Save([FromBody] JsonElement payload)
    {
        var (query, requestText, description, chartType) = ParseSavePayload(payload);
        var saved = reportService.SaveReport(
            query, requestText: requestText, description: description, chartType: chartType);
        return Created($"/report/{saved.FileName}", saved);
    }

    [HttpPut("{fileName}")]
    public ActionResult<ReportDto> Update(string fileName, [FromBody] JsonElement payload)
    {
        var (query, requestText, description, chartType) = ParseSavePayload(payload);
        var report = reportService.UpdateReport(
            fileName, query, requestText, description, chartType);
        return report is null ? NotFound() : Ok(report);
    }

    [HttpDelete("{fileName}")]
    public IActionResult Delete(string fileName)
        => reportService.DeleteReport(fileName) ? NoContent() : NotFound();

    private (QueryDefinition Query, string? RequestText, string? Description, string? ChartType) ParseSavePayload(JsonElement payload)
    {
        var queryElement = payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("query", out var wrappedQuery)
                ? wrappedQuery
                : payload;
        var query = JsonSerializer.Deserialize<QueryDefinition>(
            queryElement.GetRawText(),
            jsonOptions.Value.SerializerOptions)
            ?? throw new JsonException("The query request cannot be empty.");
        var requestText = payload.ValueKind == JsonValueKind.Object &&
            payload.TryGetProperty("requestText", out var textElement)
                ? textElement.ValueKind switch
                {
                    JsonValueKind.Null => null,
                    JsonValueKind.String => textElement.GetString(),
                    _ => throw new JsonException("Request text must be a string or null.")
                }
                : null;
        var description = ReadOptionalString(payload, "description", "Description");
        var chartType = ReadOptionalString(payload, "chartType", "ChartType");
        return (query, requestText, description, chartType);
    }

    private static string? ReadOptionalString(JsonElement payload, string camelCaseName, string pascalCaseName)
    {
        if (payload.ValueKind != JsonValueKind.Object)
            return null;
        if (!payload.TryGetProperty(camelCaseName, out var value) &&
            !payload.TryGetProperty(pascalCaseName, out value))
            return null;
        return value.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.String => value.GetString(),
            _ => throw new JsonException($"{pascalCaseName} must be a string or null.")
        };
    }

    /// <summary>Request payload for parsing edited query text against a fixed entity.</summary>
    /// <summary>Text to parse as a report query for a specified entity.</summary>
    public sealed record ReportTextRequest(string? Text, string? Entity);
}
