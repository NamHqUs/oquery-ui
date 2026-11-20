using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using OQuery.QueryDefinitions.Parsers;
using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Services;

/// <summary>Converts stored query request JSON to and from QueryDto using the OQuery query definition parser.</summary>
internal static class QueryRequestCodec
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    static QueryRequestCodec()
        => QueryDefinitionJsonParser.Configure(JsonOptions);

    public static QueryDto Parse(QueryRequestRecordDto record)
    {
        var parsedDefinition = QueryDefinitionJsonParser.Parse(record.Json);
        var requestMetadata = JsonNode.Parse(record.Json)?.AsObject()
            ?? throw new InvalidDataException($"Query request '{record.Id}' is not a JSON object.");
        requestMetadata.Remove("contexts");
        requestMetadata.Remove("Contexts");
        if (requestMetadata["Projections"] is null && requestMetadata["projection"] is JsonNode projection)
            requestMetadata["Projections"] = projection.DeepClone();

        var query = JsonSerializer.Deserialize<QueryDto>(requestMetadata.ToJsonString(), JsonOptions)
            ?? throw new InvalidDataException($"Query request '{record.Id}' is empty.");
        query = query with { Contexts = parsedDefinition.Contexts, IsBuiltin = record.IsBuiltin };
        if (string.IsNullOrWhiteSpace(query.Id) ||
            string.IsNullOrWhiteSpace(query.Name) ||
            string.IsNullOrWhiteSpace(query.Entity) ||
            query.Projections is null)
            throw new InvalidDataException($"Query request '{record.Id}' is missing required data.");

        return query;
    }

    public static QueryRequestRecordDto ToRecord(QueryDto query)
        => new(query.Id, JsonSerializer.Serialize(query, JsonOptions), IsBuiltin: false);
}
