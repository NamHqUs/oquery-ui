using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Demo.Repositories.FileStorage;

public sealed class DomainFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<DomainDto>(filePathResolver, "Domains"), IDomainRepository
{
    public override IReadOnlyCollection<DomainDto> GetBuiltin() =>
    [
        new DomainDto { Name = "All", Entities = [] },
    ];

    public override IReadOnlyCollection<DomainDto> GetUserDefined(string userSectionId)
    {
        var directory = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(directory))
            return [];

        var builtinNames = GetBuiltin().Select(scope => scope.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var scopes = new Dictionary<string, DomainDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
        {
            var scope = JsonSerializer.Deserialize<DomainDto>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize domain from '{path}'.");
            if (string.IsNullOrWhiteSpace(scope.Name))
                throw new InvalidDataException($"Domain '{path}' has no name.");
            if (builtinNames.Contains(scope.Name))
                throw new InvalidDataException($"User domain '{scope.Name}' cannot replace a built-in domain.");
            if (!scopes.TryAdd(scope.Name, scope))
                throw new InvalidDataException($"Duplicate user domain '{scope.Name}' found in '{path}'.");
        }

        return scopes.Values.ToArray();
    }

    public override DomainDto? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(scope =>
            string.Equals(scope.Name, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, DomainDto scope)
    {
        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, GetFileId(scope.Name)),
            JsonSerializer.Serialize(scope, new JsonSerializerOptions { WriteIndented = true }));
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
