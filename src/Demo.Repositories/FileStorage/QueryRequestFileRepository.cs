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
    private const string FOLDER_NAME = "queries";
    private const string FILE_EXTENSION = ".json";
    private const string OQUERY_FILE_EXTENSION = ".oqr";
    private const string ID_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static readonly JsonSerializerOptions JSON_OPTIONS = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    static QueryRequestFileRepository()
        => QueryDefinitionJsonParser.Configure(JSON_OPTIONS);

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
        ArgumentNullException.ThrowIfNull(query.Projections);

        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        var jsonPath = GetUserFilePath(userSectionId, query.Id);
        var oqueryPath = Path.ChangeExtension(jsonPath, OQUERY_FILE_EXTENSION);
        var oquery = QueryDefinitionOQueryParser.Write(query);
        File.WriteAllText(
            jsonPath,
            Serialize(query));
        File.WriteAllText(oqueryPath, oquery);
    }

    public override bool Delete(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        var oqueryPath = Path.ChangeExtension(path, OQUERY_FILE_EXTENSION);
        if (File.Exists(oqueryPath))
            File.Delete(oqueryPath);
        return true;
    }

    private static bool IsJsonFile(string path)
        => string.Equals(Path.GetExtension(path), FILE_EXTENSION, StringComparison.OrdinalIgnoreCase);

    private static QueryDto ReadQueryRequest(string path, bool isBuiltin)
    {
        var json = File.ReadAllText(path);
        if (isBuiltin)
            json = CreateBuiltinRequestJson(json, Path.GetFileNameWithoutExtension(path));
        var parsedDefinition = QueryDefinitionJsonParser.Parse(json);
        var requestMetadata = JsonNode.Parse(json)?.AsObject()
            ?? throw new InvalidDataException($"Query request file '{path}' is not a JSON object.");
        requestMetadata.Remove("contexts");
        requestMetadata.Remove("Contexts");
        if (requestMetadata["Projections"] is null && requestMetadata["projection"] is JsonNode projection)
            requestMetadata["Projections"] = projection.DeepClone();
        var query = JsonSerializer.Deserialize<QueryDto>(
            requestMetadata.ToJsonString(),
            JSON_OPTIONS)
            ?? throw new InvalidDataException($"Query request file '{path}' is empty.");
        query = query with { Contexts = parsedDefinition.Contexts };
        if (query is null ||
            string.IsNullOrWhiteSpace(query.Id) ||
            string.IsNullOrWhiteSpace(query.Name) ||
            string.IsNullOrWhiteSpace(query.Entity) ||
            query.Projections is null)
            throw new InvalidDataException($"Query request file '{path}' is missing required data.");

        query = query with { IsBuiltin = isBuiltin };
        return query;
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

    private static string Serialize(QueryDto query)
        => JsonSerializer.Serialize(query, JSON_OPTIONS);
}
