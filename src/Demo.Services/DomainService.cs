using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery;

namespace Demo.Services;

public sealed class DomainService(
    IDomainRepository repository,
    IMetadataRepository metadataRepository,
    IUserSectionManager userSectionManager,
    IDatabaseService databaseService) : IDomainService
{
    public IReadOnlyList<DomainDto> GetAll()
    {
        var sectionId = userSectionManager.GetSectionId();
        var builtinEntities = metadataRepository.GetBuiltin()
            .Select(MetadataEntityDto.FromEntity)
            .ToArray();
        var userNames = repository.GetUserDefined(sectionId)
            .Select(scope => scope.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return repository.GetBuiltin()
            .Concat(repository.GetUserDefined(sectionId))
            .Select(scope => Copy(
                scope,
                scope.Entities.Count == 0 && !scope.CanDelete ? builtinEntities : scope.Entities,
                userNames.Contains(scope.Name)))
            .OrderBy(scope => scope.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public IReadOnlyList<MetadataEntityDto> GetEntities(string? scopeName)
        => GetAll().FirstOrDefault(scope =>
                scope.Name.Equals(string.IsNullOrWhiteSpace(scopeName) ? "All" : scopeName.Trim(),
                    StringComparison.OrdinalIgnoreCase))
            ?.Entities
            ?? throw new KeyNotFoundException($"Domain '{scopeName}' was not found.");

    public DomainDto Create(DomainDto scope)
    {
        var normalized = Validate(scope);
        var sectionId = userSectionManager.GetSectionId();
        if (GetAll().Any(existing => existing.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A domain named '{normalized.Name}' already exists.");
        ValidateEntities(normalized.Entities);
        normalized.CanDelete = true;
        normalized.IsBuiltin = false;
        repository.Save(sectionId, normalized);
        return normalized;
    }

    public DomainDto Generate(DomainGenerationRequestDto request)
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

        var selectedKeys = selected
            .Select(table => TableKey(table!.Schema, table.Name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var generated = selected
            .Select(table => table!)
            .ToDictionary(
                table => TableKey(table.Schema, table.Name),
                table =>
                {
                    var selection = request.Tables.First(selection =>
                        selection.Name.Equals(table.Name, StringComparison.OrdinalIgnoreCase)
                        && selection.Schema.Equals(table.Schema, StringComparison.OrdinalIgnoreCase));
                    return CreateEntity(table, selection);
                },
                StringComparer.OrdinalIgnoreCase);

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

        return Create(new DomainDto
        {
            Name = request.Name,
            Description = request.Description,
            Entities = generated.Values.Select(MetadataEntityDto.FromEntity).ToList(),
        });
    }

    public DomainDto Update(string scopeName, DomainDto scope)
    {
        var sectionId = userSectionManager.GetSectionId();
        if (repository.GetBuiltin().Any(existing => existing.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Built-in domain '{scopeName}' is read-only.");
        var existing = repository.GetUserDefined(sectionId).FirstOrDefault(item =>
            item.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase))
            ?? throw new KeyNotFoundException($"Domain '{scopeName}' was not found.");
        var normalized = Validate(scope);
        ValidateEntities(normalized.Entities);
        if (GetAll().Any(item => !item.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)
            && item.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A domain named '{normalized.Name}' already exists.");
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
            throw new InvalidOperationException($"Built-in domain '{scopeName}' cannot be deleted.");
        if (repository.GetUserDefined(sectionId).Any(scope => scope.Name.Equals(scopeName, StringComparison.OrdinalIgnoreCase)))
            repository.Delete(sectionId, scopeName);
    }

    public IMetadataProvider GetMetadataProvider(string? scopeName)
    {
        var requestedName = string.IsNullOrWhiteSpace(scopeName) ? "All" : scopeName.Trim();
        var scope = GetAll().FirstOrDefault(item =>
            item.Name.Equals(requestedName, StringComparison.OrdinalIgnoreCase))
            ?? throw new KeyNotFoundException($"Domain '{requestedName}' was not found.");
        return new MetadataProvider(scope.Entities.Select(entity => entity.ToEntity()).ToArray());
    }

    private static void ValidateEntities(IReadOnlyCollection<MetadataEntityDto> entities)
    {
        if (entities is null)
            throw new ArgumentException("Domain entities are required.", nameof(entities));
        if (entities.Any(entity => entity is null || string.IsNullOrWhiteSpace(entity.Name)))
            throw new ArgumentException("Every domain entity must have a name.", nameof(entities));
        if (entities.Select(entity => entity.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != entities.Count)
            throw new ArgumentException("Entity names must be unique within a domain.", nameof(entities));
    }

    private static DomainDto Validate(DomainDto scope)
    {
        ArgumentNullException.ThrowIfNull(scope);
        if (string.IsNullOrWhiteSpace(scope.Name))
            throw new ArgumentException("Domain name is required.");
        if (scope.Entities is null)
            scope.Entities = [];
        scope.Name = scope.Name.Trim();
        return scope;
    }

    private static DomainDto Copy(DomainDto source, IReadOnlyList<MetadataEntityDto> entities, bool canDelete)
        => new()
        {
            Name = source.Name,
            Description = source.Description,
            Entities = entities.ToList(),
            CanDelete = canDelete,
            IsBuiltin = !canDelete,
        };

    private static Entity CreateEntity(DatabaseTableDto table, DatabaseTableSelectionDto selection)
        => new(
            string.IsNullOrWhiteSpace(selection.EntityName) ? table.Name : selection.EntityName.Trim(),
            table.Columns.Where(column => selection.Columns.Contains(column.Name, StringComparer.OrdinalIgnoreCase)).Select(column => new Field(
                selection.ColumnMappings?.FirstOrDefault(mapping => mapping.DbColumn.Equals(column.Name, StringComparison.OrdinalIgnoreCase))?.Name
                    is { Length: > 0 } fieldName
                    ? fieldName.Trim()
                    : column.Name,
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
