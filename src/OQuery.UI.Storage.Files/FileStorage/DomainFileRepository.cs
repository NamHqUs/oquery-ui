using OQuery.UI.Abstracts;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using System.Text.Json;

namespace OQuery.UI.Storage.Files.FileStorage;

public sealed class DomainFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<DomainDto>(filePathResolver, "Domains"), IDomainRepository
{
    private readonly FilePathResolver _filePathResolver = filePathResolver;
    private IReadOnlyCollection<DomainDto>? _builtinDomains;

    public override IReadOnlyCollection<DomainDto> GetBuiltin()
    {
        if (_builtinDomains is null)
        {
            var domains = new Dictionary<string, DomainDto>(StringComparer.OrdinalIgnoreCase);
            foreach (var path in _filePathResolver.EnumerateBuiltinFiles(BuiltinDatasets.DomainsFolder, ".json"))
            {
                var domain = JsonSerializer.Deserialize<DomainDto>(File.ReadAllText(path))
                    ?? throw new InvalidDataException($"Failed to deserialize built-in domain from '{path}'.");
                if (string.IsNullOrWhiteSpace(domain.Name))
                    throw new InvalidDataException($"Built-in domain '{path}' has no name.");
                domain.Id = string.IsNullOrWhiteSpace(domain.Id)
                    ? Path.GetFileNameWithoutExtension(path)
                    : domain.Id;
                domain.IsBuiltin = true;
                if (!domains.TryAdd(domain.Name, domain))
                    throw new InvalidDataException($"Duplicate built-in domain '{domain.Name}' found in '{path}'.");
            }

            _builtinDomains = domains.Values.ToArray();
        }

        return _builtinDomains;
    }

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
            scope.Id = string.IsNullOrWhiteSpace(scope.Id)
                ? Path.GetFileNameWithoutExtension(path)
                : scope.Id;
        }

        return scopes.Values.ToArray();
    }

    public override DomainDto? Get(string userSectionId, string id)
        => ReadDomainFile(userSectionId, id);

    public override void Save(string userSectionId, DomainDto scope)
    {
        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, scope.Id),
            JsonSerializer.Serialize(scope, new JsonSerializerOptions { WriteIndented = true }));
    }

    public override bool Delete(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private DomainDto? ReadDomainFile(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, id);
        if (!File.Exists(path))
            return null;

        var scope = JsonSerializer.Deserialize<DomainDto>(File.ReadAllText(path))
            ?? throw new InvalidOperationException($"Failed to deserialize domain from '{path}'.");
        scope.Id = string.IsNullOrWhiteSpace(scope.Id)
            ? Path.GetFileNameWithoutExtension(path)
            : scope.Id;
        return scope;
    }
}
