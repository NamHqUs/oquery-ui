using Demo.Contracts.Repositories;
using Demo.Contracts.Dto;
using OQuery;
using OQuery.QueryDefinitions.Parsers;
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

    static QueryRequestFileRepository()
        => JsonQueryDefinitionParser.Configure(JSON_OPTIONS);

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
        var dir = Path.Combine(AppContext.BaseDirectory, "BuiltinQueries");
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
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Id);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(query.Entity);
        ArgumentNullException.ThrowIfNull(query.Projection);

        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, query.Id),
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
        if (query is null ||
            string.IsNullOrWhiteSpace(query.Id) ||
            string.IsNullOrWhiteSpace(query.Name) ||
            string.IsNullOrWhiteSpace(query.Entity) ||
            query.Projection is null)
            throw new InvalidDataException($"Query request file '{path}' is missing required data.");

        query = query with { IsBuiltin = isBuiltin };
        if (!isBuiltin && !string.Equals(sourceJson, json, StringComparison.Ordinal))
            File.WriteAllText(path, Serialize(query));
        return query;
    }

    private static string NormalizeLegacyQueryRequest(string json, string fallbackName)
    {
        var root = JsonNode.Parse(json);
        if (root is not JsonObject queryRequest)
            return json;

        var wasNormalized = false;
        if (GetProperty(queryRequest, "MainQuery") is JsonObject legacyMainQuery)
        {
            var contexts = GetProperty(queryRequest, "Contexts")?.DeepClone();
            var isBuiltin = GetProperty(queryRequest, "IsBuiltin")?.DeepClone();
            queryRequest = legacyMainQuery.DeepClone()!.AsObject();
            if (contexts is not null)
                queryRequest["Contexts"] = contexts;
            if (isBuiltin is not null)
                queryRequest["IsBuiltin"] = isBuiltin;
            wasNormalized = true;
        }

        if (GetProperty(queryRequest, "Name") is null)
        {
            queryRequest["Name"] = fallbackName;
            wasNormalized = true;
        }
        if (GetProperty(queryRequest, "Id") is null)
        {
            queryRequest["Id"] = fallbackName;
            wasNormalized = true;
        }

        NormalizeQueryContext(queryRequest, ref wasNormalized);
        if (queryRequest["Contexts"] is JsonArray legacyContextNodes)
        {
            var contextNodes = new JsonObject();
            foreach (var context in legacyContextNodes.OfType<JsonObject>())
            {
                var name = GetProperty(context, "Name")?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(name))
                    continue;
                context.Remove("Name");
                contextNodes[name] = context.DeepClone();
            }
            queryRequest["Contexts"] = contextNodes;
            wasNormalized = true;
        }
        NormalizeContextRegistry(queryRequest, ref wasNormalized);

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
            string.Equals(property.Key, "Filter", StringComparison.OrdinalIgnoreCase)
            || string.Equals(property.Key, "Filters", StringComparison.OrdinalIgnoreCase));
        if (filtersProperty.Value is not null
            && !string.Equals(filtersProperty.Key, "Filter", StringComparison.Ordinal))
        {
            query["Filter"] = filtersProperty.Value.DeepClone();
            query.Remove(filtersProperty.Key);
            filtersProperty = query.FirstOrDefault(property =>
                string.Equals(property.Key, "Filter", StringComparison.Ordinal));
            wasNormalized = true;
        }
        if (filtersProperty.Value is JsonValue filterValue
            && filterValue.TryGetValue<string>(out var filterText)
            && !string.IsNullOrWhiteSpace(filterText))
        {
            var filter = OQuery.QueryDefinitions.Parsers.QueryDefinitionParser
                .ParseFilter(filterText);
            query[filtersProperty.Key] = JsonSerializer.SerializeToNode(
                filter,
                filter?.GetType() ?? typeof(object),
                JSON_OPTIONS);
            wasNormalized = true;
        }
        if (filtersProperty.Value is JsonArray filters)
        {
            query["Filter"] = filters.Count switch
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
            string.Equals(property.Key, "Relations", StringComparison.OrdinalIgnoreCase)
            || string.Equals(property.Key, "ExtraRelations", StringComparison.OrdinalIgnoreCase));
        if (relationsProperty.Value is not null
            && !string.Equals(relationsProperty.Key, "Relations", StringComparison.Ordinal))
        {
            query["Relations"] = relationsProperty.Value.DeepClone();
            query.Remove(relationsProperty.Key);
            relationsProperty = query.FirstOrDefault(property =>
                string.Equals(property.Key, "Relations", StringComparison.OrdinalIgnoreCase));
            wasNormalized = true;
        }
        if (relationsProperty.Value is JsonArray relations)
        {
            foreach (var relationNode in relations.OfType<JsonObject>())
            {
                var conditionProperty = relationNode.FirstOrDefault(property =>
                    string.Equals(property.Key, "Condition", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(property.Key, "Relation", StringComparison.OrdinalIgnoreCase));
                if (conditionProperty.Value is JsonValue conditionValue
                    && conditionValue.TryGetValue<string>(out var conditionText)
                    && !string.IsNullOrWhiteSpace(conditionText))
                {
                    var condition = OQuery.QueryDefinitions.Parsers.QueryDefinitionParser
                        .ParseJoinCondition(conditionText);
                    relationNode["Condition"] = JsonSerializer.SerializeToNode(
                        condition,
                        condition?.GetType() ?? typeof(object),
                        JSON_OPTIONS);
                }
                else if (conditionProperty.Value is not null
                    && !string.Equals(conditionProperty.Key, "Condition", StringComparison.Ordinal))
                    relationNode["Condition"] = conditionProperty.Value.DeepClone();
                relationNode.Remove("Relation");
                if (GetProperty(relationNode, "RefContext") is null
                    && GetProperty(relationNode, "RefContextId") is JsonValue legacyRef)
                    relationNode["RefContext"] = legacyRef.DeepClone();
                relationNode.Remove("RefContextId");
                wasNormalized = true;
            }
        }

        var sortsProperty = query.FirstOrDefault(property =>
            string.Equals(property.Key, "Sorts", StringComparison.OrdinalIgnoreCase));
        if (sortsProperty.Value is JsonArray sorts && sorts.Count > 0)
        {
            if (sorts.Any(sort => sort is JsonArray))
            {
                var flattened = new JsonArray();
                foreach (var sort in sorts)
                {
                    if (sort is not JsonArray group)
                        throw new JsonException("A legacy sort list must contain only groups.");
                    foreach (var item in group)
                        flattened.Add(item?.DeepClone());
                }
                query[sortsProperty.Key] = flattened;
                wasNormalized = true;
            }
        }

    }

    private static void NormalizeContextRegistry(JsonObject queryRequest, ref bool wasNormalized)
    {
        if (queryRequest["Contexts"] is not JsonObject contextObject)
            return;

        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var property in contextObject)
        {
            if (property.Value is not JsonObject context)
                throw new JsonException("A query context must be an object.");
            var name = GetProperty(context, "Name")?.GetValue<string>();
            var resolvedName = string.IsNullOrWhiteSpace(name) ? property.Key : name;
            names[property.Key] = resolvedName;
            var id = GetProperty(context, "Id")?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(id))
                names[id] = resolvedName;
        }

        var normalizedContexts = new JsonObject();
        foreach (var property in contextObject)
        {
            var context = property.Value!.DeepClone()!.AsObject();
            context.Remove("Name");
            context.Remove("Id");
            RewriteRelationReferences(context, names);
            normalizedContexts[names[property.Key]] = context;
        }

        queryRequest["Contexts"] = normalizedContexts;
        RewriteRelationReferences(
            GetProperty(queryRequest, "MainQuery")?.AsObject() ?? queryRequest,
            names);
        wasNormalized = true;
    }

    private static void RewriteRelationReferences(
        JsonObject query,
        IReadOnlyDictionary<string, string> names)
    {
        if (GetProperty(query, "Relations") is not JsonArray relations)
            return;

        foreach (var relation in relations.OfType<JsonObject>())
        {
            var reference = GetProperty(relation, "RefContext")?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(reference) &&
                names.TryGetValue(reference, out var name))
                relation["RefContext"] = name;
        }
    }

    private static JsonNode? GetProperty(JsonObject value, string name)
        => value.FirstOrDefault(property =>
            string.Equals(property.Key, name, StringComparison.OrdinalIgnoreCase)).Value;

    private static string Serialize(QueryDto query)
        => JsonSerializer.Serialize(query, JSON_OPTIONS);
}
