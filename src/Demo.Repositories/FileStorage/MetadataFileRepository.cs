using Demo.Contracts.Repositories;
using Microsoft.Extensions.Configuration;
using OQuery;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace Demo.Repositories.FileStorage;

public sealed class MetadataFileRepository(
    IConfiguration configuration,
    FilePathResolver filePathResolver)
    : FileRepositoryBase<Entity>(filePathResolver, FOLDER_NAME), IMetadataRepository
{
    private const string FOLDER_NAME = "UnitTestData";
    private static readonly IDeserializer YamlDeserializer = new DeserializerBuilder()
        .WithNamingConvention(CamelCaseNamingConvention.Instance)
        .Build();
    private readonly FilePathResolver _filePathResolver = filePathResolver;
    private IReadOnlyCollection<Entity> _builtinEntities = default!;

    public void Reset(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        if (Directory.Exists(dir))
            Directory.Delete(dir, recursive: true);
    }

    public override IReadOnlyCollection<Entity> GetBuiltin()
    {
        if (_builtinEntities is null)
        {
            var useCases = configuration.GetSection("DbProvider:UseCases").Get<string[]>() ?? Array.Empty<string>();
            var metadataDirectory = _filePathResolver.GetMetadataStoreFolder();
            if (!Directory.Exists(metadataDirectory))
                throw new DirectoryNotFoundException($"Metadata directory '{metadataDirectory}' was not found.");

            var entities = new Dictionary<string, Entity>(StringComparer.OrdinalIgnoreCase);
            foreach (var useCase in useCases)
            {
                var path = Directory.EnumerateFiles(metadataDirectory)
                    .SingleOrDefault(candidate =>
                        string.Equals(Path.GetFileNameWithoutExtension(candidate), useCase, StringComparison.OrdinalIgnoreCase) &&
                        (string.Equals(Path.GetExtension(candidate), ".yml", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(Path.GetExtension(candidate), ".yaml", StringComparison.OrdinalIgnoreCase)));
                if (path is null)
                    throw new FileNotFoundException($"Metadata file for use case '{useCase}' was not found.", useCase);

                foreach (var entity in ReadMetadata(path))
                {
                    if (!entities.TryAdd(entity.Name, entity))
                        throw new InvalidDataException($"Duplicate built-in entity '{entity.Name}' found in '{path}'.");
                }
            }

            _builtinEntities = entities.Values.ToArray();
        }

        return _builtinEntities;
    }

    private static IReadOnlyCollection<Entity> ReadMetadata(string path)
    {
        var definitions = YamlDeserializer.Deserialize<List<EntityDefinition>>(File.ReadAllText(path))
            ?? throw new InvalidDataException($"Metadata file '{path}' is empty.");
        return definitions.Select(definition => definition.ToEntity(path)).ToArray();
    }

    private sealed class EntityDefinition
    {
        public string? Name { get; set; }
        public string? DbSchema { get; set; }
        public string? DbTable { get; set; }
        public bool IsRawSql { get; set; }
        public List<FieldDefinition>? Fields { get; set; }
        public List<RelationDefinition>? Relations { get; set; }

        public Entity ToEntity(string path)
        {
            if (string.IsNullOrWhiteSpace(Name))
                throw new InvalidDataException($"Metadata file '{path}' contains an entity without a name.");
            if (Fields is null)
                throw new InvalidDataException($"Metadata entity '{Name}' in '{path}' has no fields.");

            return new Entity(
                Name,
                Fields.Select(field => field.ToField(Name, path)).ToList(),
                DbSchema,
                DbTable,
                Relations?.Select(relation => relation.ToRelation(Name, path)).ToList(),
                IsRawSql);
        }
    }

    private sealed class FieldDefinition
    {
        public string? Name { get; set; }
        public string? DbColumn { get; set; }
        public DataType DataType { get; set; }
        public bool IsRawSql { get; set; }

        public Field ToField(string entityName, string path)
        {
            var dbColumn = DbColumn ?? Name;
            if (string.IsNullOrWhiteSpace(Name) || string.IsNullOrWhiteSpace(dbColumn))
                throw new InvalidDataException($"Metadata entity '{entityName}' in '{path}' contains an invalid field.");
            return new Field(Name, dbColumn, DataType, IsRawSql);
        }
    }

    private sealed class RelationDefinition
    {
        public string? Name { get; set; }
        public string? RefEntity { get; set; }
        public RelationType Type { get; set; }
        public List<RelationItemDefinition>? RefKeys { get; set; }

        public Relation ToRelation(string entityName, string path)
        {
            if (string.IsNullOrWhiteSpace(Name) ||
                string.IsNullOrWhiteSpace(RefEntity) ||
                RefKeys is null ||
                RefKeys.Count == 0)
                throw new InvalidDataException($"Metadata entity '{entityName}' in '{path}' contains an invalid relation.");
            return new Relation(
                Name,
                RefEntity,
                Type,
                RefKeys.Select(key => key.ToRelationItem(entityName, path)).ToList());
        }
    }

    private sealed class RelationItemDefinition
    {
        public string? DbColumn { get; set; }
        public string? RefDbColumn { get; set; }

        public RelationItem ToRelationItem(string entityName, string path)
        {
            if (string.IsNullOrWhiteSpace(DbColumn) || string.IsNullOrWhiteSpace(RefDbColumn))
                throw new InvalidDataException($"Metadata entity '{entityName}' in '{path}' contains an invalid relation key.");
            return new RelationItem(DbColumn, RefDbColumn);
        }
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
