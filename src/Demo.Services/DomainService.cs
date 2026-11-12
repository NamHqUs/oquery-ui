using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery;

namespace Demo.Services;

public sealed class DomainService(
    IDomainRepository repository,
    IUserSectionManager userSectionManager,
    IDatabaseService databaseService) : IDomainService
{
    private IReadOnlyList<DomainDto> GetAllDomainsForValidation()
    {
        var sectionId = userSectionManager.GetSectionId();
        return repository.GetBuiltin()
            .Concat(repository.GetUserDefined(sectionId))
            .Select(scope => new DomainDto
            {
                Id = scope.Id,
                Name = scope.Name,
                Description = scope.Description,
                Relations = scope.Relations,
                CanDelete = scope.CanDelete,
                IsBuiltin = scope.IsBuiltin,
            })
            .OrderBy(scope => scope.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public IReadOnlyList<DomainNameDto> GetAllDomainNames()
        => GetAllDomainsForValidation()
            .Select(scope => new DomainNameDto(scope.Id, scope.Name))
            .ToArray();

    public IReadOnlyList<DomainNameWithDescriptionDto> GetAllDomainNameWithDescriptions()
        => GetAllDomainsForValidation()
            .Select(scope => new DomainNameWithDescriptionDto(scope.Id, scope.Name, scope.Description))
            .ToArray();

    public DomainDto GetById(string domainId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(domainId);
        var requestedId = domainId.Trim();
        var sectionId = userSectionManager.GetSectionId();
        var domain = repository.Get(sectionId, requestedId)
            ?? repository.GetUserDefined(sectionId)
                .FirstOrDefault(scope => scope.Id.Equals(requestedId, StringComparison.OrdinalIgnoreCase));
        if (domain is null)
            throw new KeyNotFoundException($"Domain '{requestedId}' was not found.");
        return domain;
    }

    public DomainDto Create(DomainDto scope)
    {
        var normalized = Validate(scope);
        var sectionId = userSectionManager.GetSectionId();
        if (GetAllDomainsForValidation().Any(existing => existing.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A domain named '{normalized.Name}' already exists.");
        normalized.Id = repository.CreateId(sectionId);
        ValidateEntities(normalized.Entities);
        ValidateRelations(normalized);
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
            Entities = generated.Values.Select(entity => EntityDto.FromEntity(entity)).ToList(),
            Relations = generated
                .SelectMany(pair => (pair.Value.Relations ?? []).Select(relation => (Source: pair.Value, Relation: relation)))
                .Where(item => generated.Values.Any(target => target.Name.Equals(item.Relation.RefEntity, StringComparison.OrdinalIgnoreCase)))
                .Where(item => item.Relation.Type == RelationType.Lookup)
                .Select(item =>
                {
                    var relation = item.Relation;
                    var target = generated.Values.Single(entity => entity.Name.Equals(relation.RefEntity, StringComparison.OrdinalIgnoreCase));
                    var reverse = target.Relations?.FirstOrDefault(candidate =>
                        candidate.RefEntity.Equals(item.Source.Name, StringComparison.OrdinalIgnoreCase)
                        && candidate.Type == RelationType.Collection);
                    return new RelationDto
                    {
                        SourceEntity = item.Source.Name,
                        SourceRelationName = relation.Name,
                        SourceFields = relation.RefKeys.Select(key => key.DbColumn).ToArray(),
                        TargetEntity = relation.RefEntity,
                        TargetRelationName = reverse?.Name ?? relation.Name,
                        TargetFields = relation.RefKeys.Select(key => key.RefDbColumn).ToArray(),
                    };
                })
                .ToList(),
        });
    }

    public DomainDto Update(string domainId, DomainDto scope)
    {
        var sectionId = userSectionManager.GetSectionId();
        var existing = GetById(domainId);
        if (existing.IsBuiltin)
            throw new InvalidOperationException($"Built-in domain '{existing.Name}' is read-only.");
        var normalized = Validate(scope);
        ValidateEntities(normalized.Entities);
        ValidateRelations(normalized);
        if (GetAllDomainsForValidation().Any(item => !item.Id.Equals(existing.Id, StringComparison.OrdinalIgnoreCase)
            && item.Name.Equals(normalized.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A domain named '{normalized.Name}' already exists.");
        normalized.Id = existing.Id;
        normalized.CanDelete = true;
        normalized.IsBuiltin = false;
        repository.Save(sectionId, normalized);
        return normalized;
    }

    public void Delete(string domainId)
    {
        var sectionId = userSectionManager.GetSectionId();
        var scope = GetById(domainId);
        if (scope.IsBuiltin)
            throw new InvalidOperationException($"Built-in domain '{scope.Name}' cannot be deleted.");
        repository.Delete(sectionId, scope.Id);
    }

    private static void ValidateEntities(IReadOnlyCollection<EntityDto> entities)
    {
        if (entities is null)
            throw new ArgumentException("Domain entities are required.", nameof(entities));
        if (entities.Any(entity => entity is null || string.IsNullOrWhiteSpace(entity.Name)))
            throw new ArgumentException("Every domain entity must have a name.", nameof(entities));
        if (entities.Select(entity => entity.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != entities.Count)
            throw new ArgumentException("Entity names must be unique within a domain.", nameof(entities));
    }

    private static void ValidateRelations(DomainDto domain)
    {
        var entityNames = domain.Entities
            .Select(entity => entity.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (domain.Relations is null)
            throw new ArgumentException("Domain relations are required.", nameof(domain));
        foreach (var relation in domain.Relations)
        {
            if (string.IsNullOrWhiteSpace(relation.SourceEntity)
                || string.IsNullOrWhiteSpace(relation.TargetEntity)
                || string.IsNullOrWhiteSpace(relation.SourceRelationName)
                || string.IsNullOrWhiteSpace(relation.TargetRelationName)
                || !entityNames.Contains(relation.SourceEntity)
                || !entityNames.Contains(relation.TargetEntity)
                || relation.SourceFields.Count == 0
                || relation.TargetFields.Count == 0
                || relation.SourceFields.Count != relation.TargetFields.Count
                || relation.SourceFields.Any(string.IsNullOrWhiteSpace)
                || relation.TargetFields.Any(string.IsNullOrWhiteSpace))
                throw new ArgumentException("Every domain relation must reference two entities and matching non-empty fields.", nameof(domain));
        }
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
