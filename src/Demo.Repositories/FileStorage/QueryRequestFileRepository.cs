using Demo.Contracts.Repositories;
using Demo.Contracts.Dto;
using OQuery;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Demo.Repositories.FileStorage;

public sealed class QueryRequestFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<QueryDto>(filePathResolver, FOLDER_NAME, FILE_EXTENSION),
        IQueryRequestRepository
{
    private const string FOLDER_NAME = "QueryRequests";
    private const string FILE_EXTENSION = ".json";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static readonly JsonSerializerOptions JSON_OPTIONS = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public override string CreateId(string userSectionId)
    {
        string id;
        do
        {
            id = $"{DateTime.UtcNow.ToString("yy-MM-dd-HH-mm-ss", CultureInfo.InvariantCulture)}-{RandomNumberGenerator.GetString(ID_CHARACTERS, 8)}";
        }
        while (File.Exists(GetUserFilePath(userSectionId, id)));

        return id;
    }

    public override IReadOnlyCollection<QueryDto> GetBuiltin()
    {
        var dir = GetBuiltinStoreFolder();
        Directory.CreateDirectory(dir);
        return Directory.EnumerateFiles(dir)
            .Where(IsJsonFile)
            .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
            .Select(path => ReadQueryRequest(path, isBuiltin: true))
            .ToArray();
    }

    public override IReadOnlyCollection<QueryDto> GetUserDefined(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(dir))
            return [];
        return Directory.EnumerateFiles(dir)
            .Where(IsJsonFile)
            .OrderByDescending(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
            .Select(path => ReadQueryRequest(path, isBuiltin: false))
            .ToArray();
    }

    public override QueryDto? Get(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        return File.Exists(path)
            ? ReadQueryRequest(path, isBuiltin: false)
            : null;
    }

    public override void Save(string userSectionId, QueryDto query)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentNullException.ThrowIfNull(query.MainQuery);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.MainQuery.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.MainQuery.Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.MainQuery.Entity);
        ArgumentNullException.ThrowIfNull(query.MainQuery.Projection);

        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, query.MainQuery.Id),
            Serialize(query));
    }

    public override bool Delete(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private static bool IsJsonFile(string path)
        => string.Equals(Path.GetExtension(path), FILE_EXTENSION, StringComparison.OrdinalIgnoreCase);

    private static QueryDto ReadQueryRequest(string path, bool isBuiltin)
    {
        var sourceJson = File.ReadAllText(path);
        var json = NormalizeLegacyQueryRequest(
            sourceJson,
            Path.GetFileNameWithoutExtension(path));
        var query = JsonSerializer.Deserialize<QueryDto>(
            json,
            JSON_OPTIONS)
            ?? throw new InvalidDataException($"Query request file '{path}' is empty.");
        if (query?.MainQuery is null ||
            string.IsNullOrWhiteSpace(query.MainQuery.Id) ||
            string.IsNullOrWhiteSpace(query.MainQuery.Name) ||
            string.IsNullOrWhiteSpace(query.MainQuery.Entity) ||
            query.MainQuery.Projection is null)
            throw new InvalidDataException($"Query request file '{path}' is missing required data.");

        query = query with { IsBuiltin = isBuiltin };
        if (!string.Equals(sourceJson, json, StringComparison.Ordinal))
            File.WriteAllText(path, Serialize(query));
        return query;
    }

    private static string NormalizeLegacyQueryRequest(string json, string fallbackName)
    {
        var root = JsonNode.Parse(json);
        if (root is not JsonObject queryRequest)
            return json;

        var wasNormalized = false;
        if (!queryRequest.Any(property =>
            string.Equals(property.Key, "MainQuery", StringComparison.OrdinalIgnoreCase)))
        {
            var contexts = new JsonArray();
            var extraRelations = new JsonArray();
            var legacyContexts = GetProperty(queryRequest, "Contexts") as JsonArray;
            if (legacyContexts is not null)
            {
                foreach (var legacyContextNode in legacyContexts)
                {
                    if (legacyContextNode is not JsonObject legacyContext)
                        throw new JsonException("A legacy query context must be an object.");
                    var query = GetProperty(legacyContext, "Query") as JsonObject
                        ?? throw new JsonException("A legacy query context must contain a query.");
                    var alias = GetProperty(legacyContext, "Name")?.GetValue<string>()
                        ?? throw new JsonException("A legacy query context must contain a name.");
                    var id = GetProperty(query, "Id")?.GetValue<string>()
                        ?? $"legacy-{alias}";
                    var context = query.DeepClone()!.AsObject();
                    context["Id"] = id;
                    context["Name"] = GetProperty(query, "Name")?.DeepClone() ?? alias;
                    context["Filters"] = GetProperty(query, "Filters")?.DeepClone()
                        ?? GetProperty(query, "Filter")?.DeepClone();
                    context.Remove("Filter");
                    context["ExtraRelations"] = null;
                    contexts.Add(context);
                    extraRelations.Add(new JsonObject
                    {
                        ["RefContextId"] = id,
                        ["Alias"] = alias,
                        ["Condition"] = GetProperty(legacyContext, "Condition")?.DeepClone(),
                        ["JoinType"] = GetProperty(legacyContext, "JoinType")?.DeepClone() ?? "Left"
                    });
                }
            }

            var mainQuery = queryRequest.DeepClone()!.AsObject();
            mainQuery.Remove("Contexts");
            mainQuery.Remove("IsBuiltin");
            mainQuery["Id"] = GetProperty(queryRequest, "Id")?.DeepClone()
                ?? GetProperty(queryRequest, "Name")?.DeepClone()
                ?? fallbackName;
            mainQuery["Name"] = GetProperty(queryRequest, "Name")?.DeepClone() ?? fallbackName;
            mainQuery["ExtraRelations"] = extraRelations.Count > 0 ? extraRelations : null;
            queryRequest = new JsonObject
            {
                ["MainQuery"] = mainQuery,
                ["Contexts"] = contexts,
                ["IsBuiltin"] = GetProperty(queryRequest, "IsBuiltin")?.DeepClone() ?? false
            };
            wasNormalized = true;
        }

        if (GetProperty(queryRequest, "MainQuery") is JsonObject normalizedMainQuery)
        {
            if (GetProperty(normalizedMainQuery, "Name") is null)
            {
                normalizedMainQuery["Name"] = fallbackName;
                wasNormalized = true;
            }
            if (GetProperty(normalizedMainQuery, "Id") is null)
            {
                normalizedMainQuery["Id"] = fallbackName;
                wasNormalized = true;
            }
            NormalizeQueryContext(normalizedMainQuery, ref wasNormalized);
        }
        else
            NormalizeQueryContext(queryRequest, ref wasNormalized);
        if (queryRequest["Contexts"] is JsonArray contextNodes)
        {
            foreach (var context in contextNodes.OfType<JsonObject>())
                NormalizeQueryContext(context, ref wasNormalized);
        }

        return wasNormalized ? queryRequest.ToJsonString() : json;
    }

    private static void NormalizeQueryContext(JsonObject query, ref bool wasNormalized)
    {
        var projectionProperty = query.FirstOrDefault(property =>
            string.Equals(property.Key, "Projection", StringComparison.OrdinalIgnoreCase));
        if (projectionProperty.Value is JsonArray groups && groups.Any(group => group is JsonArray))
        {
            var flattened = new JsonArray();
            var hasGroup = false;
            foreach (var group in groups)
            {
                if (group is not JsonArray projections)
                    throw new JsonException("A legacy projection must contain only groups.");
                if (projections.Count == 0)
                    continue;

                if (hasGroup)
                {
                    flattened.Add(new JsonObject
                    {
                        ["field"] = new JsonObject
                        {
                            ["kind"] = "field",
                            ["field"] = string.Empty
                        },
                        ["alias"] = ProjectionDefinition.NewLineAlias
                    });
                }

                foreach (var projection in projections)
                    flattened.Add(projection?.DeepClone());
                hasGroup = true;
            }

            query[projectionProperty.Key] = flattened;
            wasNormalized = true;
        }

        var filtersProperty = query.FirstOrDefault(property =>
            string.Equals(property.Key, "Filters", StringComparison.OrdinalIgnoreCase));
        if (filtersProperty.Value is null)
        {
            var filterProperty = query.FirstOrDefault(property =>
                string.Equals(property.Key, "Filter", StringComparison.OrdinalIgnoreCase));
            if (filterProperty.Value is not null)
            {
                query["Filters"] = filterProperty.Value.DeepClone();
                query.Remove(filterProperty.Key);
                filtersProperty = query.FirstOrDefault(property =>
                    string.Equals(property.Key, "Filters", StringComparison.OrdinalIgnoreCase));
                wasNormalized = true;
            }
        }
        if (filtersProperty.Value is JsonValue filterValue
            && filterValue.TryGetValue<string>(out var filterText)
            && !string.IsNullOrWhiteSpace(filterText))
        {
            var filter = OQuery.Contracts.QueryDefinitions.Parsers.QueryDefinitionParser
                .ParseFilter(filterText);
            query[filtersProperty.Key] = JsonSerializer.SerializeToNode(
                filter,
                filter?.GetType() ?? typeof(object),
                JSON_OPTIONS);
            wasNormalized = true;
        }
        if (filtersProperty.Value is JsonArray filters)
        {
            query[filtersProperty.Key] = filters.Count switch
            {
                0 => null,
                1 => filters[0]?.DeepClone(),
                _ => new JsonObject
                {
                    ["logicalOperation"] = 0,
                    ["filters"] = new JsonArray(filters.Select(filter => filter?.DeepClone()).ToArray())
                }
            };
            wasNormalized = true;
        }

        var relationsProperty = query.FirstOrDefault(property =>
            string.Equals(property.Key, "ExtraRelations", StringComparison.OrdinalIgnoreCase));
        if (relationsProperty.Value is JsonArray relations)
        {
            foreach (var relationNode in relations.OfType<JsonObject>())
            {
                var conditionProperty = relationNode.FirstOrDefault(property =>
                    string.Equals(property.Key, "Condition", StringComparison.OrdinalIgnoreCase));
                if (conditionProperty.Value is not JsonValue conditionValue
                    || !conditionValue.TryGetValue<string>(out var conditionText)
                    || string.IsNullOrWhiteSpace(conditionText))
                    continue;

                var condition = OQuery.Contracts.QueryDefinitions.Parsers.QueryDefinitionParser
                    .ParseJoinCondition(conditionText);
                relationNode[conditionProperty.Key] = JsonSerializer.SerializeToNode(
                    condition,
                    condition?.GetType() ?? typeof(object),
                    JSON_OPTIONS);
                wasNormalized = true;
            }
        }

        var sortsProperty = query.FirstOrDefault(property =>
            string.Equals(property.Key, "Sorts", StringComparison.OrdinalIgnoreCase));
        if (sortsProperty.Value is JsonArray sorts && sorts.Count > 0)
        {
            var containsGroups = sorts.Any(sort => sort is JsonArray);
            if (containsGroups && sorts.Any(sort => sort is not JsonArray))
                throw new JsonException("A legacy sort list must contain only groups.");

            if (!containsGroups)
            {
                var group = new JsonArray();
                foreach (var sort in sorts)
                    group.Add(sort?.DeepClone());
                query[sortsProperty.Key] = new JsonArray(group);
                wasNormalized = true;
            }
        }

    }

    private static JsonNode? GetProperty(JsonObject value, string name)
        => value.FirstOrDefault(property =>
            string.Equals(property.Key, name, StringComparison.OrdinalIgnoreCase)).Value;

    private static string Serialize(QueryDto query)
        => JsonSerializer.Serialize(query, JSON_OPTIONS);
}
