using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery;
using OQuery.Database;

namespace OQuery.UI.Services;

public sealed class ProjectService(
    IProjectRepository repository,
    IUserSectionManager userSectionManager,
    IDatabaseService databaseService,
    IConnectionStringProtector connectionStringProtector,
    IProjectDatabaseSchemaLoader projectDatabaseSchemaLoader) : IProjectService
{
    public const string MainDomainId = "main";
    public const string MainDomainName = "Main";
    public const string MainDomainDescription = "Meta is mirrored from Database Schema";

    public IReadOnlyList<ProjectFileDto> GetAll()
        => repository.GetAll(SectionId()).Select(WithoutCiphertext).ToArray();

    public ProjectDto GetById(string projectId)
    {
        var project = RequireProject(projectId);
        return new ProjectDto
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            DbConnectionProfile = project.DbConnectionProfile,
            DbProvider = project.Connection?.Provider ?? string.Empty,
            FullDomain = repository.GetFullDomain(SectionId(), project.Id) ?? new FullDomainDto(),
            Domains = repository.GetDomains(SectionId(), project.Id).ToList(),
        };
    }

    public ProjectDto Create(ProjectFileDto project)
    {
        ArgumentNullException.ThrowIfNull(project);
        var normalized = project with
        {
            Id = repository.CreateId(SectionId()),
            Name = RequireName(project.Name, "Project"),
            Description = project.Description ?? string.Empty,
            DbConnectionProfile = project.DbConnectionProfile?.Trim() ?? string.Empty,
        } with { Connection = null };
        repository.Save(SectionId(), normalized);
        return GetById(normalized.Id);
    }

    /// <summary>
    /// Creates the project only if its database can be opened and has tables. The project folder is removed if any later step fails,
    /// so a failed request leaves no half-created project.
    /// </summary>
    public ProjectDto CreateFromDatabase(ProjectFromDatabaseRequestDto request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var name = RequireName(request.Name, "Project");
        var provider = RequireText(request.Provider, "Database provider");
        var connectionString = RequireText(request.ConnectionString, "Connection string");
        var description = request.Description?.Trim() ?? string.Empty;

        var schema = projectDatabaseSchemaLoader.LoadSchema(provider, connectionString);
        if (schema.Tables.Count == 0)
            throw new InvalidOperationException("The connected database has no tables to build a domain from.");

        var fullDomain = BuildFullDomain(schema);
        var project = new ProjectFileDto(repository.CreateId(SectionId()), name, description, string.Empty)
        {
            Connection = new ProjectConnectionDto(provider, connectionStringProtector.Protect(connectionString)),
        };
        try
        {
            repository.Save(SectionId(), project);
            repository.SaveFullDomain(SectionId(), project.Id, fullDomain);
            repository.SaveDomain(SectionId(), project.Id, MainDomain(fullDomain));
        }
        catch
        {
            repository.Delete(SectionId(), project.Id);
            throw;
        }

        return GetById(project.Id);
    }

    public ProjectDto Update(string projectId, ProjectFileDto project)
    {
        ArgumentNullException.ThrowIfNull(project);
        var existing = RequireProject(projectId);
        repository.Save(SectionId(), existing with
        {
            Name = RequireName(project.Name, "Project"),
            Description = project.Description ?? string.Empty,
            DbConnectionProfile = project.DbConnectionProfile?.Trim() ?? string.Empty,
        });
        return GetById(projectId);
    }

    public void Delete(string projectId)
    {
        if (!repository.Delete(SectionId(), projectId))
            throw new KeyNotFoundException($"Project '{projectId}' was not found.");
    }

    public FullDomainDto GenerateFullDomain(string projectId)
    {
        RequireProject(projectId);
        var fullDomain = BuildFullDomain(databaseService.GetDatabaseSchema());
        repository.SaveFullDomain(SectionId(), projectId, fullDomain);
        return fullDomain;
    }

    public FullDomainDto GetFullDomain(string projectId)
    {
        RequireProject(projectId);
        return repository.GetFullDomain(SectionId(), projectId)
            ?? throw new InvalidOperationException($"Project '{projectId}' has no full domain. Generate it first.");
    }

    public IReadOnlyList<DomainNameDto> GetDomainNames(string projectId)
    {
        RequireProject(projectId);
        return repository.GetDomains(SectionId(), projectId)
            .OrderBy(domain => domain.Name, StringComparer.OrdinalIgnoreCase)
            .Select(domain => new DomainNameDto(domain.Id, domain.Name))
            .ToArray();
    }

    public DomainDto GetDomain(string projectId, string domainId)
    {
        RequireProject(projectId);
        return repository.GetDomain(SectionId(), projectId, RequireId(domainId, "Domain"))
            ?? throw new KeyNotFoundException($"Domain '{domainId}' was not found.");
    }

    public DomainDto CreateDomain(string projectId, DomainDto domain)
    {
        ArgumentNullException.ThrowIfNull(domain);
        var fullDomain = GetFullDomain(projectId);
        var normalized = Normalize(domain, Guid.NewGuid().ToString("N")[..10]);
        EnsureDomainNameAvailable(projectId, normalized, currentId: null);
        ProjectMetadataResolver.Resolve(fullDomain, normalized);
        repository.SaveDomain(SectionId(), projectId, normalized);
        return normalized;
    }

    public DomainDto UpdateDomain(string projectId, string domainId, DomainDto domain)
    {
        ArgumentNullException.ThrowIfNull(domain);
        var fullDomain = GetFullDomain(projectId);
        var existing = GetDomain(projectId, domainId);
        var normalized = Normalize(domain, existing.Id);
        EnsureDomainNameAvailable(projectId, normalized, currentId: existing.Id);
        ProjectMetadataResolver.Resolve(fullDomain, normalized);
        repository.SaveDomain(SectionId(), projectId, normalized);
        return normalized;
    }

    public void DeleteDomain(string projectId, string domainId)
    {
        RequireProject(projectId);
        if (!repository.DeleteDomain(SectionId(), projectId, RequireId(domainId, "Domain")))
            throw new KeyNotFoundException($"Domain '{domainId}' was not found.");
    }

    public IReadOnlyList<OQuery.Entity> ResolveMetadata(string projectId, string domainId)
        => ProjectMetadataResolver.Resolve(GetFullDomain(projectId), GetDomain(projectId, domainId));

    public FullDomainDto GetResolvedDomain(string projectId, string domainId)
        => ToFullDomain(ResolveMetadata(projectId, domainId));

    /// <summary>Converts resolved entities back to the FullDomain shape. Each foreign key appears once, as its lookup side.</summary>
    private static FullDomainDto ToFullDomain(IReadOnlyList<OQuery.Entity> entities)
    {
        var relations = new List<RelationDto>();
        foreach (var source in entities)
        {
            foreach (var lookup in (source.Relations ?? []).Where(relation => relation.Type == RelationType.Lookup))
            {
                var target = entities.Single(entity => entity.Name.Equals(lookup.RefEntity, StringComparison.OrdinalIgnoreCase));
                var reverseKeys = lookup.RefKeys.Select(key => (key.RefDbColumn, key.DbColumn)).ToArray();
                var collection = target.Relations?.FirstOrDefault(relation =>
                    relation.Type == RelationType.Collection
                    && relation.RefEntity.Equals(source.Name, StringComparison.OrdinalIgnoreCase)
                    && relation.RefKeys.Select(key => (key.DbColumn, key.RefDbColumn)).SequenceEqual(reverseKeys));
                relations.Add(new RelationDto
                {
                    SourceEntity = source.Name,
                    SourceRelationName = lookup.Name,
                    SourceFields = lookup.RefKeys.Select(key => key.DbColumn).ToArray(),
                    TargetEntity = target.Name,
                    TargetRelationName = collection?.Name ?? lookup.Name,
                    TargetFields = lookup.RefKeys.Select(key => key.RefDbColumn).ToArray(),
                });
            }
        }

        return new FullDomainDto
        {
            Entities = entities.Select(entity => new EntityDto(entity.Name, entity.Fields.ToList(), entity.DbTable)
            {
                DbSchema = entity.DbSchema,
                DbTable = entity.DbTable,
                IsRawSql = entity.IsRawSql,
            }).ToList(),
            Relations = relations,
        };
    }

    private string SectionId() => userSectionManager.GetSectionId();

    private ProjectFileDto RequireProject(string projectId)
        => repository.Get(SectionId(), RequireId(projectId, "Project"))
            ?? throw new KeyNotFoundException($"Project '{projectId}' was not found.");

    private static string RequireId(string id, string label)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException($"{label} ID is required.", nameof(id));
        return id.Trim();
    }

    private static string RequireName(string? name, string label)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException($"{label} name is required.", nameof(name));
        return name.Trim();
    }

    private static string RequireText(string? value, string label)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException($"{label} is required.", nameof(value));
        return value.Trim();
    }

    /// <summary>Responses never include the encrypted connection string, only its DBMS.</summary>
    private static ProjectFileDto WithoutCiphertext(ProjectFileDto project)
        => project.Connection is null
            ? project
            : project with { Connection = project.Connection with { EncryptedConnectionString = string.Empty } };

    /// <summary>The hard-coded first domain: every FullDomain entity, named after the database.</summary>
    private static DomainDto MainDomain(FullDomainDto fullDomain)
        => new()
        {
            Id = MainDomainId,
            Name = MainDomainName,
            Description = MainDomainDescription,
            Entities = fullDomain.Entities.Select(entity => new SubDomainEntityDto(entity.Name)).ToList(),
        };

    private static DomainDto Normalize(DomainDto domain, string id)
        => new()
        {
            Id = id,
            Name = RequireName(domain.Name, "Domain"),
            Description = domain.Description ?? string.Empty,
            Entities = domain.Entities ?? [],
        };

    private void EnsureDomainNameAvailable(string projectId, DomainDto domain, string? currentId)
    {
        if (repository.GetDomains(SectionId(), projectId).Any(existing =>
            !existing.Id.Equals(currentId, StringComparison.OrdinalIgnoreCase)
            && existing.Name.Equals(domain.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A domain named '{domain.Name}' already exists.");
    }

    /// <summary>Maps every table and foreign key in the schema to a FullDomain entity and relation.</summary>
    private static FullDomainDto BuildFullDomain(DatabaseSchema schema)
    {
        var entityNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var takenEntityNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entities = new List<EntityDto>();
        foreach (var table in schema.Tables)
        {
            var name = takenEntityNames.Contains(table.Name) ? $"{table.Schema}_{table.Name}" : table.Name;
            takenEntityNames.Add(name);
            entityNames[TableKey(table.Schema, table.Name)] = name;
            entities.Add(new EntityDto(
                name,
                table.Columns.Select(column => new Field(column.Name, column.Name, ToDataType(column.DataType, column.Name))).ToList(),
                table.Name)
            {
                DbSchema = table.Schema,
                DbTable = table.Name,
            });
        }

        var relationNamesByEntity = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var relations = new List<RelationDto>();
        foreach (var relationship in schema.Relationships)
        {
            var sourceKey = TableKey(relationship.SourceSchema, relationship.SourceTable);
            var targetKey = TableKey(relationship.TargetSchema, relationship.TargetTable);
            if (!entityNames.TryGetValue(sourceKey, out var sourceEntity) || !entityNames.TryGetValue(targetKey, out var targetEntity))
                continue;

            var suffix = string.Join("_", relationship.SourceColumns);
            relations.Add(new RelationDto
            {
                SourceEntity = sourceEntity,
                SourceRelationName = UniqueName(NamesOf(relationNamesByEntity, sourceEntity), Singularize(targetEntity), suffix),
                SourceFields = relationship.SourceColumns.ToArray(),
                TargetEntity = targetEntity,
                TargetRelationName = UniqueName(NamesOf(relationNamesByEntity, targetEntity), Pluralize(sourceEntity), suffix),
                TargetFields = relationship.TargetColumns.ToArray(),
            });
        }

        return new FullDomainDto { Entities = entities, Relations = relations };
    }

    private static HashSet<string> NamesOf(Dictionary<string, HashSet<string>> namesByEntity, string entity)
    {
        if (!namesByEntity.TryGetValue(entity, out var names))
            namesByEntity[entity] = names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        return names;
    }

    /// <summary>Returns the preferred name, or a suffixed variant when the entity already has that relation name.</summary>
    private static string UniqueName(HashSet<string> taken, string preferred, string suffix)
    {
        if (taken.Add(preferred))
            return preferred;

        var candidate = $"{preferred}_{suffix}";
        for (var index = 2; !taken.Add(candidate); index++)
            candidate = $"{preferred}_{suffix}_{index}";
        return candidate;
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
