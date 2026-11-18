using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace OQuery.UI.Storage.Files.FileStorage;

/// <summary>
/// Stores user-defined function DTOs in one JSON file per database folder.
/// Built-in functions are not stored here; the consumer supplies them from its dialects.
/// </summary>
public sealed class FunctionDefinitionFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<FunctionDefinitionDto>(filePathResolver, FOLDER_NAME), IFunctionDefinitionRepository
{
    private const string FOLDER_NAME = "functions";

    public override IReadOnlyCollection<FunctionDefinitionDto> GetBuiltin() => [];

    public override IReadOnlyCollection<FunctionDefinitionDto> GetUserDefined(string userSectionId)
    {
        var merged = new Dictionary<string, FunctionDefinitionDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in GetDbTypeFolders(userSectionId).SelectMany(dir => Directory.EnumerateFiles(dir, "*.json")))
        {
            var dto = JsonSerializer.Deserialize<FunctionDefinitionDto>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize function definition from '{path}'.");
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
        return merged.Values.ToArray();
    }

    public override FunctionDefinitionDto? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(definition =>
            string.Equals(definition.Name, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, FunctionDefinitionDto definition)
    {
        Delete(userSectionId, definition.Name);
        var fileName = $"{GetFileId(definition.Name)}.json";
        foreach (var (dbType, template) in definition.SqlTemplates)
        {
            var dto = WithSingleTemplate(definition, dbType, template);
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
        return PathResolver.GetUserStoreFolder(userSectionId, Path.Combine(FOLDER_NAME, dbType));
    }

    private IEnumerable<string> GetDbTypeFolders(string userSectionId)
    {
        var root = PathResolver.GetUserStoreFolder(userSectionId, FOLDER_NAME);
        return Directory.Exists(root) ? Directory.EnumerateDirectories(root) : Enumerable.Empty<string>();
    }

    private static FunctionDefinitionDto WithSingleTemplate(FunctionDefinitionDto source, string dbType, string template)
        => new()
        {
            Name = source.Name,
            Arguments = source.Arguments,
            ResultType = source.ResultType,
            ApplyFor = source.ApplyFor,
            BindArgumentsFromEnd = source.BindArgumentsFromEnd,
            Description = source.Description,
            SqlTemplates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { [dbType] = template },
        };

    private static string GetFileId(string id)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id.ToUpperInvariant())));
        return hash;
    }
}
