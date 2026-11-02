using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using OQuery;
using OQuery;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Demo.Repositories.FileStorage;

public sealed class FunctionDefinitionFileRepository(FilePathResolver filePathResolver)
    : FileRepositoryBase<SqlFunctionDefintion>(filePathResolver, FOLDER_NAME), IFunctionDefinitionRepository
{
    private const string FOLDER_NAME = "FunctionDefinitions";

    public override IReadOnlyCollection<SqlFunctionDefintion> GetBuiltin() => GetBuiltInDefinitions();

    public override IReadOnlyCollection<SqlFunctionDefintion> GetUserDefined(string userSectionId)
    {
        var dir = GetUserStoreFolder(userSectionId);
        if (!Directory.Exists(dir))
            return [];

        var builtInNames = GetBuiltInDefinitions()
            .Select(definition => definition.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var definitions = new Dictionary<string, SqlFunctionDefintion>(StringComparer.OrdinalIgnoreCase);
        foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
        {
            var dto = JsonSerializer.Deserialize<FunctionDefinitionDto>(File.ReadAllText(path))
                ?? throw new InvalidOperationException($"Failed to deserialize function definition from '{path}'.");
            var definition = dto.ToFunctionDefinition();
            if (builtInNames.Contains(definition.Name))
                throw new InvalidDataException($"User function '{definition.Name}' cannot replace a built-in function.");
            if (!definitions.TryAdd(definition.Name, definition))
                throw new InvalidDataException($"Duplicate user function '{definition.Name}' found in '{path}'.");
        }
        return definitions.Values.ToArray();
    }

    public override SqlFunctionDefintion? Get(string userSectionId, string id)
        => GetUserDefined(userSectionId).FirstOrDefault(definition =>
            string.Equals(definition.Name, id, StringComparison.OrdinalIgnoreCase));

    public override void Save(string userSectionId, SqlFunctionDefintion definition)
    {
        Directory.CreateDirectory(GetUserStoreFolder(userSectionId));
        var path = GetUserFilePath(userSectionId, GetFileId(definition.Name));
        File.WriteAllText(path, JsonSerializer.Serialize(
            FunctionDefinitionDto.FromFunctionDefinition(definition),
            new JsonSerializerOptions { WriteIndented = true }));
    }

    public override bool Delete(string userSectionId, string id)
    {
        var path = GetUserFilePath(userSectionId, GetFileId(id));
        if (!File.Exists(path))
            return false;
        File.Delete(path);
        return true;
    }

    private static IReadOnlyCollection<SqlFunctionDefintion> GetBuiltInDefinitions()
        => new ISqlDialect[]
            {
                new SqliteDialect(),
                new SqlServerDialect(),
                new PostgresDialect(),
                new CockroachDialect(),
                new FirebirdDialect(),
                new OracleDialect(),
                new MariaDialect(),
                new SapHanaDialect(),
                new Db2Dialect()
            }
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
                    first.IsAggregate);
            })
            .ToArray();

    private static string GetFileId(string id)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id.ToUpperInvariant())));
        return hash;
    }
}
