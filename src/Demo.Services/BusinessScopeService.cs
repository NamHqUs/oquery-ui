using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery;

namespace Demo.Services;

public sealed class BusinessScopeService(
    IBusinessScopeRepository repository,
    IMetadataRepository metadataRepository,
    IUserSectionManager userSectionManager,
    IDatabaseService databaseService) : IBusinessScopeService
{
    public IReadOnlyList<BusinessScopeDto> GetAll()
    {
        var sectionId = userSectionManager.GetSectionId();
        var entities = GetEntities(sectionId);
        var userNames = repository.GetUserDefined(sectionId)
            .Select(scope => scope.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return repository.GetBuiltin()
            .Concat(repository.GetUserDefined(sectionId))
            .Select(scope => Copy(scope, scope.Entities.Count == 0 ? entities : scope.Entities, userNames.Contains(scope.Name)))
            .OrderBy(scope => scope.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public BusinessScopeDto Create(BusinessScopeDto scope)
    {
        var normalized = Validate(scope);
        var sectionId = userSectionManager.GetSectionId();
        if (GetAll().Any(existing => existing.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A business scope named '{normalized.Name}' already exists.");
        normalized.Entities = NormalizeEntities(normalized.Entities, sectionId);
        normalized.CanDelete = true;
        normalized.IsBuiltin = false;
        repository.Save(sectionId, normalized);
        return normalized;
    }

    public BusinessScopeDto Generate(BusinessScopeGenerationRequestDto request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var schema = databaseService.GetDatabaseSchema();
        var selected = request.Tables
            .Where(table => !string.IsNullOrWhiteSpace(table.Name))
            .Select(table => schema.Tables.FirstOrDefault(candidate =>
                candidate.Name.Equals(table.Name, StringComparison.OrdinalIgnoreCase)
                && candidate.Schema.Equals(table.Schema, StringComparison.OrdinalIgnoreCase)))
            .ToArray();
        if (selected.Any(table => table is null))
            throw new ArgumentException("Every selected table must exist in the connected database.", nameof(request));
        if (selected.Length == 0)
            throw new ArgumentException("At least one database table must be selected.", nameof(request));

        var sectionId = userSectionManager.GetSectionId();
        var existing = GetMetadataEntities(sectionId)
            .ToDictionary(entity => TableKey(entity.DbSchema, entity.DbTable), StringComparer.OrdinalIgnoreCase);
        var selectedKeys = selected
            .Select(table => TableKey(table!.Schema, table.Name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var generated = selected
            .Select(table => table!)
            .ToDictionary(table => TableKey(table.Schema, table.Name), table => CreateEntity(table, request.Tables.First(selection =>
                selection.Name.Equals(table.Name, StringComparison.OrdinalIgnoreCase)
                && selection.Schema.Equals(table.Schema, StringComparison.OrdinalIgnoreCase)).Columns), StringComparer.OrdinalIgnoreCase);

        foreach (var table in selected)
        {
            var key = TableKey(table!.Schema, table.Name);
            if (existing.ContainsKey(key))
                generated[key] = existing[key];
        }

        foreach (var relationship in schema.Relationships)
        {
            var sourceKey = TableKey(relationship.SourceSchema, relationship.SourceTable);
            var targetKey = TableKey(relationship.TargetSchema, relationship.TargetTable);
            if (!selectedKeys.Contains(sourceKey) || !selectedKeys.Contains(targetKey))
                continue;

            var relationSelection = request.Relations.FirstOrDefault(item =>
                item.SourceSchema.Equals(relationship.SourceSchema, StringComparison.OrdinalIgnoreCase)
                && item.SourceTable.Equals(relationship.SourceTable, StringComparison.OrdinalIgnoreCase)
                && item.TargetSchema.Equals(relationship.TargetSchema, StringComparison.OrdinalIgnoreCase)
                && item.TargetTable.Equals(relationship.TargetTable, StringComparison.OrdinalIgnoreCase));
            AddRelation(generated[sourceKey], new Relation(
                relationSelection?.LookupName ?? Singularize(generated[targetKey].Name),
                generated[targetKey].Name,
                RelationType.Lookup,
                relationship.SourceColumns.Zip(relationship.TargetColumns, (source, target) => new RelationItem(source, target)).ToList()));
            AddRelation(generated[targetKey], new Relation(
                relationSelection?.CollectionName ?? Pluralize(generated[sourceKey].Name),
                generated[sourceKey].Name,
                RelationType.Collection,
                relationship.TargetColumns.Zip(relationship.SourceColumns, (target, source) => new RelationItem(target, source)).ToList()));
        }

        foreach (var entity in generated.Values)
        {
            if (!existing.ContainsKey(TableKey(entity.DbSchema, entity.DbTable)))
                metadataRepository.Save(sectionId, entity);
        }

        return Create(new BusinessScopeDto
        {
            Name = request.Name,
            Entities = generated.Values.Select(entity => MetadataEntityDto.FromEntity(entity, true)).ToList(),
        });
    }

    public BusinessScopeDto Update(string scopeName, BusinessScopeDto scope)
    {
        var sectionId = userSectionManager.GetSectionId();
        if (repository.GetBuiltin().Any(existing => existing.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in business scope '{scopeName}' is read-only.");
        var existing = repository.GetUserDefined(sectionId).FirstOrDefault(item =>
            item.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase))
            ?? throw new KeyNotFoundException($"Business scope '{scopeName}' was not found.");
        var normalized = Validate(scope);
        normalized.Entities = NormalizeEntities(normalized.Entities, sectionId);
        if (GetAll().Any(item => !item.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)
            && item.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A business scope named '{normalized.Name}' already exists.");
        normalized.CanDelete = true;
        normalized.IsBuiltin = false;
        repository.Save(sectionId, normalized);
        if (!existing.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase))
            repository.Delete(sectionId, existing.Name);
        return normalized;
    }

    public void Delete(string scopeName)
    {
        var sectionId = userSectionManager.GetSectionId();
        if (repository.GetBuiltin().Any(scope => scope.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in business scope '{scopeName}' cannot be deleted.");
        if (repository.GetUserDefined(sectionId).Any(scope => scope.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)))
            repository.Delete(sectionId, scopeName);
    }

    private IReadOnlyList<MetadataEntityDto> GetEntities(string sectionId)
        => metadataRepository.GetBuiltin()
            .Concat(metadataRepository.GetUserDefined(sectionId))
            .Select(entity => MetadataEntityDto.FromEntity(entity, true))
            .OrderBy(entity => entity.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private IReadOnlyList<Entity> GetMetadataEntities(string sectionId)
        => metadataRepository.GetBuiltin().Concat(metadataRepository.GetUserDefined(sectionId)).ToArray();

    private List<MetadataEntityDto> NormalizeEntities(IReadOnlyCollection<MetadataEntityDto> requested, string sectionId)
    {
        var available = GetEntities(sectionId);
        if (requested.Count == 0)
            return available.ToList();

        var availableByName = available.ToDictionary(entity => entity.Name, StringComparer.OrdinalIgnoreCase);
        var unknown = requested.Select(entity => entity.Name)
            .Where(name => !availableByName.ContainsKey(name))
            .ToArray();
        if (unknown.Length > 0)
            throw new ArgumentException($"Unknown entity names: {string.Join(", ", unknown)}.");
        return requested
            .Select(entity => availableByName[entity.Name])
            .DistinctBy(entity => entity.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static BusinessScopeDto Validate(BusinessScopeDto scope)
    {
        ArgumentNullException.ThrowIfNull(scope);
        if (string.IsNullOrWhiteSpace(scope.Name))
            throw new ArgumentException("Business scope name is required.");
        if (scope.Entities is null)
            scope.Entities = [];
        scope.Name = scope.Name.Trim();
        return scope;
    }

    private static BusinessScopeDto Copy(BusinessScopeDto source, IReadOnlyList<MetadataEntityDto> entities, bool canDelete)
        => new()
        {
            Name = source.Name,
            Entities = entities.ToList(),
            CanDelete = canDelete,
            IsBuiltin = !canDelete,
        };

    private static Entity CreateEntity(DatabaseTableDto table, IReadOnlyList<string> selectedColumns)
        => new(
            table.Name,
            table.Columns.Where(column => selectedColumns.Contains(column.Name, StringComparer.OrdinalIgnoreCase)).Select(column => new Field(
                column.Name,
                column.Name,
                ToDataType(column.DataType, column.Name))).ToList(),
            table.Schema,
            table.Name,
            []);

    private static void AddRelation(Entity entity, Relation relation)
    {
        if (entity.Relations is null)
            return;
        if (!entity.Relations.Any(existing =>
            existing.Name.Equals(relation.Name, StringComparison.OrdinalIgnoreCase)
            && existing.RefEntity.Equals(relation.RefEntity, StringComparison.OrdinalIgnoreCase)))
            entity.Relations.Add(relation);
    }

    private static DataType ToDataType(string databaseType, string columnName)
    {
        var type = databaseType.ToLowerInvariant();
        var name = columnName.ToLowerInvariant();
        if (name.StartsWith("is", StringComparison.Ordinal)
            || name.StartsWith("has", StringComparison.Ordinal)
            || name.StartsWith("can", StringComparison.Ordinal)
            || name.StartsWith("should", StringComparison.Ordinal)
            || type.Contains("bool") || type.Contains("bit"))
            return DataType.Boolean;
        if (name.Contains("birth") || name.Contains("date")
            || name.Contains("time") || name.Contains("created")
            || name.Contains("updated") || name.Contains("deleted"))
            return DataType.Datetime;
        if (type.Contains("date") || type.Contains("time")) return DataType.Datetime;
        if (type.Contains("int") || type.Contains("numeric") || type.Contains("decimal")
            || type.Contains("number") || type.Contains("money") || type.Contains("real")
            || type.Contains("float") || type.Contains("double"))
            return DataType.Number;
        return DataType.String;
    }

    private static string TableKey(string? schema, string table)
        => $"{schema ?? "dbo"}.{table}";

    private static string Singularize(string value)
        => value.EndsWith("ies", StringComparison.OrdinalIgnoreCase)
            ? value[..^3] + "y"
            : value.EndsWith("ses", StringComparison.OrdinalIgnoreCase)
                ? value[..^2]
                : value.EndsWith("s", StringComparison.OrdinalIgnoreCase) && !value.EndsWith("ss", StringComparison.OrdinalIgnoreCase)
                    ? value[..^1]
                    : value;

    private static string Pluralize(string value)
        => value.EndsWith("y", StringComparison.OrdinalIgnoreCase) && value.Length > 1
            ? value[..^1] + "ies"
            : value.EndsWith("s", StringComparison.OrdinalIgnoreCase)
                ? value
                : value + "s";
}
