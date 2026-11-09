using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Demo.Repositories.FileStorage;

public sealed class BusinessScopeFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<BusinessScopeDto>(filePathResolver, "BusinessScopes"), IBusinessScopeRepository
{
    public override IReadOnlyCollection<BusinessScopeDto> GetBuiltin() =>
    [
        new BusinessScopeDto { Name = "All", Entities = [] },
    ];

    public override IReadOnlyCollection<BusinessScopeDto> GetUserDefined(string userSectionId)
    {
        var directory = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(directory))
            return [];

        var builtinNames = GetBuiltin().Select(scope => scope.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var scopes = new Dictionary<string, BusinessScopeDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
        {
            var scope = JsonSerializer.Deserialize<BusinessScopeDto>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize business scope from '{path}'.");
            if (string.IsNullOrWhiteSpace(scope.Name))
                throw new InvalidDataException($"Business scope '{path}' has no name.");
            if (builtinNames.Contains(scope.Name))
                throw new InvalidDataException($"User business scope '{scope.Name}' cannot replace a built-in scope.");
            if (!scopes.TryAdd(scope.Name, scope))
                throw new InvalidDataException($"Duplicate user business scope '{scope.Name}' found in '{path}'.");
        }

        return scopes.Values.ToArray();
    }

    public override BusinessScopeDto? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(scope =>
            string.Equals(scope.Name, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, BusinessScopeDto scope)
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
