using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Demo.Repositories.FileStorage;

public sealed class OperatorDefinitionFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<OperatorDefinitionDto>(filePathResolver, "OperatorDefinitions"),
        IOperatorDefinitionRepository
{
    public override IReadOnlyCollection<OperatorDefinitionDto> GetBuiltin() => [];

    public override IReadOnlyCollection<OperatorDefinitionDto> GetUserDefined(string userSectionId)
    {
        var directory = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(directory))
            return [];

        var definitions = new Dictionary<string, OperatorDefinitionDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
        {
            var definition = JsonSerializer.Deserialize<OperatorDefinitionDto>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize operator definition from '{path}'.");
            if (!definitions.TryAdd(definition.Id, definition))
                throw new InvalidDataException($"Duplicate user operator '{definition.Id}' found in '{path}'.");
        }
        return definitions.Values.ToArray();
    }

    public override OperatorDefinitionDto? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(definition =>
            string.Equals(definition.Id, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, OperatorDefinitionDto item)
    {
        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, GetFileId(item.Id)),
            JsonSerializer.Serialize(item, new JsonSerializerOptions { WriteIndented = true }));
    }

    public override bool Delete(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, GetFileId(id));
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private static string GetFileId(string id)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id.ToUpperInvariant())));
}
