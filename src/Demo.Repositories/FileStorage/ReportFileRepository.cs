using Demo.Contracts.Repositories;
using Demo.Contracts.Dto;
using OQuery;
using OQuery.QueryDefinitions.Parsers;
using System.Text.Json;
using System.Text.Json.Serialization;
using YamlDotNet.Serialization;

namespace Demo.Repositories.FileStorage;

public sealed class ReportFileRepository : FileRepositoryBase<ReportDto>, IReportRepository
{
    private const string FOLDER_NAME = "Reports";
    private const string FILE_EXTENSION = ".yml";

    public ReportFileRepository(FilePathResolver filePathResolver)
        : base(filePathResolver, FOLDER_NAME, FILE_EXTENSION)
    {
    }


    public override IReadOnlyCollection<ReportDto> GetUserDefined(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        Directory.CreateDirectory(dir);
        return Directory.EnumerateFiles(dir)
            .Where(path => HasExtension(path, FILE_EXTENSION))
            .OrderByDescending(Path.GetFileName)
            .Select(path => Load(userSectionId, path))
            .ToArray();
    }

    public override IReadOnlyCollection<ReportDto> GetBuiltin()
    {
        var dir = GetBuiltinStoreFolder();
        Directory.CreateDirectory(dir);
        return Directory.EnumerateFiles(dir)
            .Where(path => string.Equals(Path.GetExtension(path), ".yml", StringComparison.OrdinalIgnoreCase))
            .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase)
            .Select(path => ReadYml(Path.GetFileName(path)!, File.ReadAllText(path)) with { CanDelete = false })
            .ToArray();
    }

    public override ReportDto? Get(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        if (File.Exists(path))
            return Load(userSectionId, path);
        var legacyPath = Path.ChangeExtension(path, FILE_EXTENSION);
        return File.Exists(legacyPath) ? Load(userSectionId, legacyPath) : null;
    }

    public override void Save(string userSectionId, ReportDto report)
    {
        var dir = GetUserStoreFolder(userSectionId);
        Directory.CreateDirectory(dir);
        File.WriteAllText(GetUserFilePath(userSectionId, report.FileName), SerializeYml(report));
    }

    private static string SerializeYml(ReportDto report)
    {
        var header = new Dictionary<string, string>();
        if (!string.IsNullOrWhiteSpace(report.Name))
            header["Name"] = report.Name;
        if (!string.IsNullOrWhiteSpace(report.Description))
            header["Description"] = report.Description;
        if (!string.IsNullOrWhiteSpace(report.ChartType))
            header["ChartType"] = report.ChartType;

        var lines = new List<string>();
        if (header.Count > 0)
            lines.AddRange(new SerializerBuilder().Build().Serialize(header)
                .Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries));
        lines.Add("Query:");
        lines.AddRange(YamlQueryDefinitionParser.Write(report.Query)
            .Split(["\r\n", "\n"], StringSplitOptions.None)
            .Select(line => $"  {line}"));
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static ReportDto ReadYml(string fileName, string text)
    {
        var root = new DeserializerBuilder().Build().Deserialize<Dictionary<string, object?>>(text)
            ?? throw new InvalidDataException($"Query request file '{fileName}' is empty.");


        var queryValue = root.GetValueOrDefault("Query");
        var queryText = queryValue as string ?? GetNestedQueryText(fileName, text);
        var query = QueryDefinitionParser.ParseFromYml(queryText);
        var description = root.GetValueOrDefault("Description") as string;
        var chartType = root.GetValueOrDefault("ChartType") as string;

        var name = root.GetValueOrDefault("Name") as string;
        return new ReportDto(fileName, query, YamlQueryDefinitionParser.Write(query), description, chartType)
        {
            Name = name
        };
    }

    private static string GetNestedQueryText(string fileName, string text)
    {
        var lines = text.Split(["\r\n", "\n"], StringSplitOptions.None);
        var queryLine = Array.FindIndex(lines, line =>
            line.Equals("Query:", StringComparison.OrdinalIgnoreCase));
        if (queryLine < 0)
            throw new InvalidDataException($"Query request file '{fileName}' has an empty Query.");

        var queryLines = lines.Skip(queryLine + 1)
            .TakeWhile(line => string.IsNullOrWhiteSpace(line) || char.IsWhiteSpace(line[0]))
            .ToArray();
        var indentation = queryLines
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Select(line => line.TakeWhile(char.IsWhiteSpace).Count())
            .DefaultIfEmpty(0)
            .Min();
        if (indentation == 0)
            throw new InvalidDataException($"Query request file '{fileName}' has an empty Query.");

        var queryText = string.Join(Environment.NewLine, queryLines.Select(line =>
            string.IsNullOrWhiteSpace(line) ? string.Empty : line[indentation..]));
        return string.IsNullOrWhiteSpace(queryText)
            ? throw new InvalidDataException($"Query request file '{fileName}' has an empty Query.")
            : queryText;
    }

    private ReportDto Load(string userSectionId, string path)
    {
        var fileName = Path.GetFileNameWithoutExtension(path);
        if (HasExtension(path, FILE_EXTENSION))
            return ReadYml(fileName, File.ReadAllText(path));

        // Legacy JSON report: convert to YAML on first access.
        var report = Read(path) with { FileName = fileName };
        var ymlPath = GetUserFilePath(userSectionId, fileName);
        if (!File.Exists(ymlPath))
            File.WriteAllText(ymlPath, SerializeYml(report));
        File.Delete(path);
        return report;
    }

    private static bool HasExtension(string path, string extension)
        => string.Equals(Path.GetExtension(path), extension, StringComparison.OrdinalIgnoreCase);

    public override bool Delete(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        var legacyPath = Path.ChangeExtension(path, FILE_EXTENSION);
        var deleted = false;
        foreach (var candidate in new[] { path, legacyPath })
        {
            if (!File.Exists(candidate))
                continue;
            File.Delete(candidate);
            deleted = true;
        }
        return deleted;
    }

    private ReportDto Read(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var fileName = Path.GetFileName(path)!;
        var queryElement = TryGetProperty(root, "Query", out var storedQuery) ? storedQuery : root;
        var requestText = TryGetProperty(root, "RequestText", out var text) &&
            text.ValueKind == JsonValueKind.String ? text.GetString() : null;
        var description = TryGetProperty(root, "Description", out var descriptionElement) &&
            descriptionElement.ValueKind == JsonValueKind.String ? descriptionElement.GetString() : null;
        var chartType = TryGetProperty(root, "ChartType", out var chartElement) &&
            chartElement.ValueKind == JsonValueKind.String ? chartElement.GetString() : null;
        var name = TryGetProperty(root, "Name", out var nameElement) &&
            nameElement.ValueKind == JsonValueKind.String ? nameElement.GetString() : null;
        var query = JsonSerializer.Deserialize<QueryDefinition>(queryElement.GetRawText(), Options())
            ?? throw new InvalidDataException($"Query request file '{Path.GetFileName(path)}' is empty.");
        if (name is null && TryGetProperty(queryElement, "Name", out nameElement) &&
            nameElement.ValueKind == JsonValueKind.String)
            name = nameElement.GetString();

        if (!TryGetProperty(queryElement, "Projection", out _))
        {
            if (TryGetProperty(queryElement, "Fields", out var legacyFields))
            {
                query = new QueryDefinition
                {
                    Entity = query.Entity,
                    Projection = legacyFields.EnumerateArray()
                        .Select(field => JsonSerializer.Deserialize<ProjectionDefinition>(
                            field.GetRawText(),
                            Options()) ?? throw new InvalidDataException("A saved projection field is empty."))
                        .ToList(),
                    Filter = query.Filter,
                    Sorts = query.Sorts,
                    Page = query.Page,
                    PageSize = query.PageSize
                };
            }
            else if (TryGetProperty(queryElement, "Columns", out var legacyColumns))
            {
                query = new QueryDefinition
                {
                    Entity = query.Entity,
                    Projection = legacyColumns.EnumerateArray().Select(ParseLegacyProjection).ToList(),
                    Filter = query.Filter,
                    Sorts = query.Sorts,
                    Page = query.Page,
                    PageSize = query.PageSize
                };
            }
        }

        return new ReportDto(fileName, query, requestText, description, chartType)
        {
            Name = name
        };
    }

    private static ProjectionDefinition ParseLegacyProjection(JsonElement column)
    {
        var alias = TryGetProperty(column, "Alias", out var aliasElement)
            ? aliasElement.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String => aliasElement.GetString(),
                _ => throw new InvalidDataException("A saved projection alias must be a string or null.")
            }
            : null;
        object field = TryGetProperty(column, "Expression", out var expressionElement) &&
            expressionElement.ValueKind != JsonValueKind.Null
                ? expressionElement.Clone()
                : TryGetProperty(column, "Field", out var fieldElement) &&
                    fieldElement.ValueKind == JsonValueKind.String
                    ? new { kind = "field", field = fieldElement.GetString() }
                    : throw new InvalidDataException("A saved projection must contain a field or expression.");
        return JsonSerializer.Deserialize<ProjectionDefinition>(
            JsonSerializer.Serialize(new { field, alias }), Options())
            ?? throw new InvalidDataException("A saved projection field is empty.");
    }

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
        => element.TryGetProperty(name, out value) ||
            element.TryGetProperty(char.ToLowerInvariant(name[0]) + name[1..], out value);

    private static JsonSerializerOptions Options(bool writeIndented = false)
    {
        var options = new JsonSerializerOptions
        {
            WriteIndented = writeIndented,
            Converters = { new JsonStringEnumConverter<DataType>() }
        };
        JsonQueryDefinitionParser.Configure(options);
        return options;
    }
}
