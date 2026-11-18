using OQuery.UI.Abstracts;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using System.Text.Json;

namespace OQuery.UI.Storage.Files.FileStorage;

public sealed class DomainFileRepository : FileRepositoryBase<DomainDto>, IDomainRepository
{
    private readonly IReadOnlyCollection<DomainDto> _builtin;

    public DomainFileRepository(FilePathResolver filePathResolver, IReadOnlyCollection<DomainDto> builtinDomains)
        : base(filePathResolver, "Domains")
    {
        ArgumentNullException.ThrowIfNull(builtinDomains);
        _builtin = builtinDomains;
    }

    public override IReadOnlyCollection<DomainDto> GetAll(string userSectionId)
        => [.. _builtin, .. ReadUserDomains(userSectionId)];

    public override DomainDto? Get(string userSectionId, string id)
        => _builtin.FirstOrDefault(domain => domain.Id == id) ?? ReadDomainFile(userSectionId, id);

    public override void Save(string userSectionId, DomainDto scope)
    {
        ArgumentNullException.ThrowIfNull(scope);
        if (_builtin.Any(domain => domain.Id == scope.Id))
            throw new InvalidOperationException($"Built-in domain '{scope.Id}' is read-only.");
        if (_builtin.Any(domain => string.Equals(domain.Name, scope.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"User domain '{scope.Name}' cannot replace a built-in domain.");

        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        File.WriteAllText(
            GetUserFilePath(userSectionId, scope.Id),
            JsonSerializer.Serialize(scope, new JsonSerializerOptions { WriteIndented = true }));
    }

    public override bool Delete(string userSectionId, string id)
    {
        if (_builtin.Any(domain => domain.Id == id))
            throw new InvalidOperationException($"Built-in domain '{id}' is read-only.");

        var path = GetUserFilePath(userSectionId, id);
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private IReadOnlyCollection<DomainDto> ReadUserDomains(string userSectionId)
    {
        var directory = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(directory))
            return [];

        var builtinNames = _builtin.Select(scope => scope.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
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
