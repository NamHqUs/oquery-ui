using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace OQuery.UI.Storage.Files.FileStorage;

public sealed class FunctionDefinitionFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<SqlFunctionDefintion>(filePathResolver, FOLDER_NAME), IFunctionDefinitionRepository
{
    private const string FOLDER_NAME = "functions";

    public override IReadOnlyCollection<SqlFunctionDefintion> GetBuiltin() => GetBuiltInDefinitions();

    public override IReadOnlyCollection<SqlFunctionDefintion> GetUserDefined(string userSectionId)
    {
        var builtInNames = GetBuiltInDefinitions()
            .Select(definition => definition.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var merged = new Dictionary<string, FunctionDefinitionDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in GetDbTypeFolders(userSectionId).SelectMany(dir => Directory.EnumerateFiles(dir, "*.json")))
        {
            var dto = JsonSerializer.Deserialize<FunctionDefinitionDto>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize function definition from '{path}'.");
            if (builtInNames.Contains(dto.Name))
                throw new InvalidDataException($"User function '{dto.Name}' cannot replace a built-in function.");
            if (!merged.TryGetValue(dto.Name, out var existing))
            {
                merged[dto.Name] = dto;
                continue;
            }
            foreach (var (dbType, template) in dto.SqlTemplates)
            {
                if (!existing.SqlTemplates.TryAdd(dbType, template))
                    throw new InvalidDataException($"Duplicate SQL template for user function '{dto.Name}' and database '{dbType}' found in '{path}'.");
            }
        }
        return merged.Values.Select(dto => dto.ToFunctionDefinition()).ToArray();
    }

    public override SqlFunctionDefintion? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(definition =>
            string.Equals(definition.Name, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, SqlFunctionDefintion definition)
    {
        Delete(userSectionId, definition.Name);
        var fileName = $"{GetFileId(definition.Name)}.json";
        foreach (var (dbType, template) in definition.SqlTemplates)
        {
            var dto = FunctionDefinitionDto.FromFunctionDefinition(definition);
            dto.SqlTemplates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { [dbType] = template };
            var dir = GetDbTypeFolder(userSectionId, dbType);
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, fileName), JsonSerializer.Serialize(
                dto,
                new JsonSerializerOptions { WriteIndented = true }));
        }
    }

    public override bool Delete(string userSectionId, string id)
    {
        var fileName = $"{GetFileId(id)}.json";
        var deleted = false;
        foreach (var path in GetDbTypeFolders(userSectionId).Select(dir => Path.Combine(dir, fileName)))
        {
            if (!File.Exists(path))
                continue;
            File.Delete(path);
            deleted = true;
        }
        return deleted;
    }

    private string GetDbTypeFolder(string userSectionId, string dbType)
    {
        if (string.IsNullOrWhiteSpace(dbType) || Path.GetFileName(dbType) != dbType)
            throw new ArgumentException("SQL template key is not a valid database folder name.", nameof(dbType));
        return filePathResolver.GetUserStoreFolder(userSectionId, Path.Combine(FOLDER_NAME, dbType));
    }

    private IEnumerable<string> GetDbTypeFolders(string userSectionId)
    {
        var root = filePathResolver.GetUserStoreFolder(userSectionId, FOLDER_NAME);
        return Directory.Exists(root) ? Directory.EnumerateDirectories(root) : Enumerable.Empty<string>();
    }

    private static IReadOnlyCollection<SqlFunctionDefintion> GetBuiltInDefinitions()
        => SqlDialectRegistry.CreateAllDialects()
            .SelectMany(dialect => new FunctionProvider(dialect).GetFunctions())
            .GroupBy(function => function.Name, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var first = group.First();
                return new SqlFunctionDefintion(
                    first.Name,
                    first.Arguments,
                    first.ResultType,
                    first.Description,
                    group.SelectMany(function => function.SqlTemplates)
                        .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase),
                    first.BindArgumentsFromEnd,
                    first.FunctionApplyFor);
            })
            .ToArray();

    private static string GetFileId(string id)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id.ToUpperInvariant())));
        return hash;
    }
}
