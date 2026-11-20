using OQuery.UI.Abstracts.Dto;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace OQuery.UI.Services;

/// <summary>Read-only built-in data loaded by the consumer (API and tests) and handed to the repositories.</summary>
public sealed record BuiltinData(IReadOnlyCollection<QueryRequestRecordDto> Queries);

/// <summary>
/// Loads built-in data from "{basePath}/{dataSet}/{queries|scripts}".
/// The consumer chooses the dataset folders; a missing folder contributes nothing.
/// </summary>
public static class BuiltinDataLoader
{
    private const string QueriesFolder = "queries";
    private const string ScriptsFolder = "scripts";

    public static BuiltinData Load(string? basePath, IEnumerable<string> dataSets)
    {
        var root = ResolveBasePath(basePath);
        var queries = new List<QueryRequestRecordDto>();

        foreach (var dataSet in dataSets)
        {
            var dataSetRoot = Path.Combine(root, dataSet);

            foreach (var path in EnumerateFiles(Path.Combine(dataSetRoot, QueriesFolder), ".json"))
                queries.Add(ReadQueryRequest(path));
        }

        return new BuiltinData(queries.ToArray());
    }

    /// <summary>Finds seed scripts named "*.{provider}.sql" in each chosen dataset's scripts folder.</summary>
    public static IReadOnlyList<string> GetScripts(string? basePath, IEnumerable<string> dataSets, string provider)
    {
        var root = ResolveBasePath(basePath);
        var suffix = $".{provider}.sql";
        return dataSets
            .SelectMany(dataSet => EnumerateFiles(Path.Combine(root, dataSet, ScriptsFolder), ".sql"))
            .Where(path => Path.GetFileName(path).EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    public static string ResolveBasePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new InvalidOperationException("Seeds base path is missing.");
        return Path.GetFullPath(Path.Combine(Environment.CurrentDirectory, path));
    }

    private static IEnumerable<string> EnumerateFiles(string folder, params string[] extensions)
    {
        if (!Directory.Exists(folder))
            return [];

        return Directory.EnumerateFiles(folder)
            .Where(path => extensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
            .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase);
    }

    private static QueryRequestRecordDto ReadQueryRequest(string path)
    {
        var json = CreateBuiltinRequestJson(File.ReadAllText(path), Path.GetFileNameWithoutExtension(path));
        var root = JsonNode.Parse(json)?.AsObject()
            ?? throw new InvalidDataException($"Query request '{path}' is not a JSON object.");
        var id = root["id"]?.GetValue<string>() ?? root["Id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidDataException($"Query request '{path}' is missing an id.");

        return new QueryRequestRecordDto(id, json, true);
    }

    private static string CreateBuiltinRequestJson(string json, string fallbackName)
    {
        var root = JsonNode.Parse(json)?.AsObject()
            ?? throw new InvalidDataException("A built-in query request must be a JSON object.");
        if (root["name"] is not null || root["Name"] is not null)
            return json;

        var mainQuery = root["MainQuery"]?.DeepClone()?.AsObject()
            ?? root["mainQuery"]?.DeepClone()?.AsObject()
            ?? throw new InvalidDataException("A built-in query request requires a MainQuery object.");
        var request = mainQuery;
        NormalizeBuiltinQuery(request);
        request["name"] ??= mainQuery["Name"]?.DeepClone() ?? fallbackName;
        request["id"] ??= root["id"]?.DeepClone() ?? root["Id"]?.DeepClone() ?? fallbackName;
        if (root["contexts"] is not null)
            request["contexts"] = root["contexts"]!.DeepClone();
        else if (root["Contexts"] is not null)
            request["contexts"] = root["Contexts"]!.DeepClone();
        if (request["contexts"] is JsonObject contexts)
            foreach (var context in contexts.Select(item => item.Value).OfType<JsonObject>())
                NormalizeBuiltinQuery(context);
        else if (request["contexts"] is JsonArray contextArray)
        {
            foreach (var context in contextArray.OfType<JsonObject>())
                NormalizeBuiltinQuery(context);
            NormalizeBuiltinRelationReferences(request, contextArray);
        }
        return request.ToJsonString();
    }

    private static void NormalizeBuiltinQuery(JsonObject query)
    {
        NormalizePropertyName(query, "Name", "name");
        NormalizePropertyName(query, "Entity", "entity");
        NormalizePropertyName(query, "Id", "id");
        NormalizePropertyName(query, "Projection", "projection");
        NormalizePropertyName(query, "Filters", "filter");
        NormalizePropertyName(query, "ExtraRelations", "joins");

        if (query["Sorts"] is JsonArray legacySorts)
        {
            var sorts = new JsonArray();
            foreach (var group in legacySorts)
            {
                if (group is JsonArray nested)
                {
                    foreach (var sort in nested)
                        sorts.Add(NormalizeSort(sort));
                }
                else
                {
                    sorts.Add(NormalizeSort(group));
                }
            }
            query["sorts"] = sorts;
            query.Remove("Sorts");
        }

        if (query["Page"] is JsonValue page &&
            page.TryGetValue<int>(out var pageNumber) &&
            query["PageSize"] is JsonValue pageSize &&
            pageSize.TryGetValue<int>(out var size))
        {
            query["skip"] = Math.Max(0, pageNumber - 1) * size;
            query["take"] = size;
            query.Remove("Page");
            query.Remove("PageSize");
        }

        if (query["joins"] is JsonArray joins)
            foreach (var join in joins.OfType<JsonObject>())
                NormalizePropertyName(join, "RefContextId", "refContext");
    }

    private static void NormalizeBuiltinRelationReferences(JsonObject query, JsonArray contexts)
    {
        var contextNamesById = contexts
            .OfType<JsonObject>()
            .Select(context => (
                Id: context["id"]?.GetValue<string>(),
                Name: context["name"]?.GetValue<string>()))
            .Where(context => !string.IsNullOrWhiteSpace(context.Id)
                && !string.IsNullOrWhiteSpace(context.Name))
            .ToDictionary(context => context.Id!, context => context.Name!, StringComparer.OrdinalIgnoreCase);

        if (query["joins"] is not JsonArray joins)
            return;

        foreach (var join in joins.OfType<JsonObject>())
        {
            if (join["refContext"] is JsonValue refContext
                && refContext.TryGetValue<string>(out var contextId)
                && contextNamesById.TryGetValue(contextId, out var contextName))
                join["refContext"] = contextName;
        }
    }

    private static JsonNode? NormalizeSort(JsonNode? value)
    {
        if (value is not JsonObject sort)
            throw new JsonException("A built-in sort must be an object.");
        NormalizePropertyName(sort, "Field", "field");
        NormalizePropertyName(sort, "Direction", "direction");
        return sort.DeepClone();
    }

    private static void NormalizePropertyName(JsonObject value, string oldName, string newName)
    {
        if (value[newName] is not null || value[oldName] is null)
            return;
        value[newName] = value[oldName]!.DeepClone();
        value.Remove(oldName);
    }
}
