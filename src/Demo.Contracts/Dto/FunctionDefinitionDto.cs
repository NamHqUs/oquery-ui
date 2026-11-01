using OQuery;
using System.Text.Json;
using static OQuery.SqlFunctionDefintion;

namespace Demo.Contracts.Dto;

public sealed class FunctionDefinitionDto
{
    public string Name { get; set; } = "";
    public List<FunctionArgumentDefinitionDto> Arguments { get; set; } = [];
    public string ResultType { get; set; } = "";
    public bool CanDelete { get; set; }
    public bool IsBuiltin { get; set; }
    public bool IsAggregate { get; set; }
    public string Description { get; set; } = "";
    public Dictionary<string, string> SqlTemplates { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    public SqlFunctionDefintion ToFunctionDefinition()
    {
        if (string.IsNullOrWhiteSpace(ResultType))
            throw new ArgumentException("A result type is required.", nameof(ResultType));
        if (!TryParseResultType(ResultType, out var resultType))
            throw new ArgumentException($"Unsupported result type [{ResultType}].", nameof(ResultType));

        var arguments = Arguments.Select(argument =>
        {
            var defaultValue = argument.DefaultValue is { } value
                ? ToValue(value, argument.DataType)
                : null;
            return new SqlFunctionArgumentDefinition(argument.Name, argument.DataType, defaultValue);
        }).ToArray();

        return new SqlFunctionDefintion(
            Name,
            arguments,
            resultType,
            Description,
            SqlTemplates,
            IsAggregate);
    }

    public static FunctionDefinitionDto FromFunctionDefinition(SqlFunctionDefintion definition)
        => new()
        {
            Name = definition.Name,
            Arguments = definition.Arguments.Select(argument => new FunctionArgumentDefinitionDto
            {
                Name = argument.Name,
                DataType = argument.DataType,
                DefaultValue = argument.DefaultValue is null
                    ? null
                    : JsonSerializer.SerializeToElement(argument.DefaultValue)
            }).ToList(),
            ResultType = definition.ResultType.ToString(),
            IsAggregate = definition.IsAggregate,
            Description = definition.Description,
            SqlTemplates = new Dictionary<string, string>(definition.SqlTemplates, StringComparer.OrdinalIgnoreCase)
        };

    private static object ToValue(JsonElement value, DataType dataType)
        => value.ValueKind == JsonValueKind.String && value.GetString() == "*"
            ? "*"
            : dataType switch
        {
            DataType.String when value.ValueKind == JsonValueKind.String => value.GetString()!,
            DataType.Number when value.ValueKind == JsonValueKind.Number => value.GetDecimal(),
            DataType.Datetime when value.ValueKind == JsonValueKind.String &&
                value.TryGetDateTime(out var dateTime) => dateTime,
            DataType.Boolean when value.ValueKind is JsonValueKind.True or JsonValueKind.False =>
                value.GetBoolean(),
            _ => throw new ArgumentException($"The default value must match argument data type [{dataType}].")
        };

    private static bool TryParseResultType(string resultType, out DataType dataType)
        => ResultTypes.TryGetValue(resultType, out dataType);

    private static readonly IReadOnlyDictionary<string, DataType> ResultTypes =
        new Dictionary<string, DataType>(StringComparer.OrdinalIgnoreCase)
        {
            ["String"] = DataType.String,
            ["Number"] = DataType.Number,
            ["Datetime"] = DataType.Datetime,
            ["Boolean"] = DataType.Boolean,
            ["int"] = DataType.Number,
            ["long"] = DataType.Number,
            ["decimal"] = DataType.Number,
            ["double"] = DataType.Number,
            ["bool"] = DataType.Boolean
        };
}

/// <summary>Represents an argument accepted by a SQL function.</summary>
public sealed class FunctionArgumentDefinitionDto
{
    public string Name { get; set; } = "";
    public DataType DataType { get; set; }
    public JsonElement? DefaultValue { get; set; }
}
