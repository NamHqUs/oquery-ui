using Demo.Contracts.Repositories;
using Demo.Share;
using Microsoft.Extensions.Configuration;
using OQuery;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Demo.Repositories.FileStorage;

public sealed class MetadataFileRepository(IConfiguration configuration, FilePathResolver filePathResolver)
    : FileRepositoryBase<Entity>(filePathResolver, FOLDER_NAME), IMetadataRepository
{
    private const string FOLDER_NAME = "UnitTestData";
    private IReadOnlyCollection<Entity> _builtinEntities = default!;
    public void Reset(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        if (Directory.Exists(dir))
            Directory.Delete(dir, recursive: true);
    }

    

    public override IReadOnlyCollection<Entity> GetBuiltin() {
        if (_builtinEntities is null)
        {
            var useCases = configuration.GetSection("DbProvider:UseCases").Get<string[]>() ?? Array.Empty<string>();

            var list = new List<Entity>();
            if (useCases.Contains("northstar-demo"))
                list.AddRange(BuiltinMetadata.NorthStarDemoData);
            if (useCases.Contains("sale-demo"))
                list.AddRange(BuiltinMetadata.SaleDemoData);
            if (useCases.Contains("unit-test"))
                list.AddRange(BuiltinMetadata.UnitTestData);

            _builtinEntities = list;
        }

        return _builtinEntities;
    }

    public override IReadOnlyCollection<Entity> GetUserDefined(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(dir))
            return [];

        var builtInNames = GetBuiltin()
            .Select(entity => entity.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var entities = new Dictionary<string, Entity>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
        {
            var entity = JsonSerializer.Deserialize<Entity>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize entity from '{path}'.");
            if (builtInNames.Contains(entity.Name))
                throw new InvalidDataException($"User entity '{entity.Name}' cannot replace a built-in entity.");
            if (!entities.TryAdd(entity.Name, entity))
                throw new InvalidDataException($"Duplicate user entity '{entity.Name}' found in '{path}'.");
        }
        return entities.Values.ToArray();
    }

    public override Entity? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(entity =>
            string.Equals(entity.Name, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, Entity entity)
    {
        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, GetFileId(entity.Name)),
            JsonSerializer.Serialize(entity, new JsonSerializerOptions { WriteIndented = true }));
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
