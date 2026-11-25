using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery;
using System.Security.Cryptography;
using System.Text.Json;

namespace OQuery.UI.Services;

public sealed class ProjectService(
    IProjectRepository repository,
    IUserSectionManager userSectionManager,
    IDatabaseService databaseService,
    IConnectionStringProtector connectionStringProtector,
    IProjectDatabaseSchemaLoader projectDatabaseSchemaLoader,
    IQueryRequestRepository queryRepository,
    IPlaygroundRepository playgroundRepository) : IProjectService
{
    public const string MainDomainId = "main";
    public const string MainDomainName = "Main";
    public const string MainDomainDescription = "Meta is mirrored from Database Schema";

    public IReadOnlyList<ProjectFileDto> GetAll()
        => repository.GetAll(SectionId()).Select(WithoutCiphertext).ToArray();

    public ProjectDto GetById(string projectId)
    {
        var project = RequireProject(projectId);
        if (project.Connection is not null)
            databaseService.Connect(project.Connection.Provider, connectionStringProtector.Unprotect(project.Connection.EncryptedConnectionString));

        return new ProjectDto
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            DbConnectionProfile = project.DbConnectionProfile,
            DbProvider = project.Connection?.Provider ?? string.Empty,
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

        var mainDomain = BuildMainDomain(schema);
        var project = new ProjectFileDto(repository.CreateId(SectionId()), name, description, string.Empty)
        {
            Connection = new ProjectConnectionDto(provider, connectionStringProtector.Protect(connectionString)),
        };
        try
        {
            repository.Save(SectionId(), project);
            repository.SaveDomain(SectionId(), project.Id, mainDomain);
            databaseService.Connect(provider, connectionString);
        }
        catch
        {
            repository.Delete(SectionId(), project.Id);
            throw;
        }

        return GetById(project.Id);
    }

    /// <summary>
    /// Imports a project folder as a new project. Every check runs before the first write, so a rejected import leaves nothing behind.
    /// The project is returned from the request without connecting to its database.
    /// </summary>
    public ProjectDto Import(ProjectImportDto request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var sectionId = SectionId();
        var name = RequireName(request.Project.Name, "Project");
        var connection = request.Project.Connection is null
            ? null
            : new ProjectConnectionDto(
                RequireText(request.Project.Connection.Provider, "Database provider"),
                VerifiedCiphertext(request.Project.Connection.EncryptedConnectionString));

        if (repository.GetAll(sectionId).Any(existing => existing.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A project named '{name}' already exists.");

        var domains = NormalizeImportedDomains(request.Domains);
        var domainIds = domains.Select(domain => domain.Id).ToHashSet(StringComparer.Ordinal);
        var playgrounds = NormalizeImportedPlaygrounds(request.Playgrounds, domainIds);
        var queries = NormalizeImportedQueries(request.Queries);

        var projectId = AvailableProjectId(sectionId, request.Project.Id);
        var project = new ProjectFileDto(projectId, name, request.Project.Description ?? string.Empty, request.Project.DbConnectionProfile?.Trim() ?? string.Empty)
        {
            Connection = connection,
        };
        var scope = new StorageScope(sectionId, projectId);
        try
        {
            repository.Save(sectionId, project);
            foreach (var domain in domains)
                repository.SaveDomain(sectionId, projectId, domain);
            foreach (var query in queries)
                queryRepository.Save(scope, query);
            foreach (var playground in playgrounds)
                playgroundRepository.Save(scope, playground);
        }
        catch
        {
            repository.Delete(sectionId, projectId);
            throw;
        }

        return new ProjectDto
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            DbConnectionProfile = project.DbConnectionProfile,
            DbProvider = connection?.Provider ?? string.Empty,
            Domains = domains,
        };
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
        RequireProject(projectId);
        var normalized = Normalize(domain, Guid.NewGuid().ToString("N")[..10]);
        EnsureDomainNameAvailable(projectId, normalized, currentId: null);
        ProjectMetadataResolver.Resolve(normalized);
        repository.SaveDomain(SectionId(), projectId, normalized);
        return normalized;
    }

    public DomainDto UpdateDomain(string projectId, string domainId, DomainDto domain)
    {
        ArgumentNullException.ThrowIfNull(domain);
        var existing = GetDomain(projectId, domainId);
        var normalized = Normalize(domain, existing.Id);
        EnsureDomainNameAvailable(projectId, normalized, currentId: existing.Id);
        ProjectMetadataResolver.Resolve(normalized);
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
        => ProjectMetadataResolver.Resolve(GetDomain(projectId, domainId));

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

    /// <summary>IDs become folder and file names, so only ASCII letters, digits, '-' and '_' are allowed.</summary>
    private static string RequireSafeId(string? id, string label)
    {
        if (string.IsNullOrEmpty(id) || !id.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_'))
            throw new ArgumentException($"{label} ID '{id}' may only contain letters, digits, '-' and '_'.");
        return id;
    }

    /// <summary>Checks that this server can decrypt the carried connection string. The import is rejected otherwise.</summary>
    private string VerifiedCiphertext(string protectedValue)
    {
        try
        {
            connectionStringProtector.Unprotect(protectedValue);
        }
        catch (Exception exception) when (exception is CryptographicException or FormatException or ArgumentException)
        {
            throw new InvalidOperationException("The connection string was encrypted with another server key, so this project cannot be imported on this server.");
        }
        return protectedValue;
    }

    private string AvailableProjectId(string sectionId, string? requested)
        => !string.IsNullOrEmpty(requested) && requested.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_')
            && repository.Get(sectionId, requested) is null
            ? requested
            : repository.CreateId(sectionId);

    private static List<DomainDto> NormalizeImportedDomains(IReadOnlyList<DomainDto> domains)
    {
        if (domains.Count == 0)
            throw new ArgumentException("The project folder has no domains.");

        var ids = new HashSet<string>(StringComparer.Ordinal);
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        return domains.Select(domain =>
        {
            var id = RequireSafeId(domain.Id, "Domain");
            if (!ids.Add(id))
                throw new ArgumentException($"Domain '{id}' appears more than once.");
            var normalized = Normalize(domain, id);
            if (!names.Add(normalized.Name))
                throw new InvalidOperationException($"A domain named '{normalized.Name}' already exists.");
            ProjectMetadataResolver.Resolve(normalized);
            return normalized;
        }).ToList();
    }

    private static List<PlaygroundDto> NormalizeImportedPlaygrounds(IReadOnlyList<PlaygroundDto> playgrounds, HashSet<string> domainIds)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        return playgrounds.Select(playground =>
        {
            var id = RequireSafeId(playground.Id, "Playground");
            if (!domainIds.Contains(playground.DomainId))
                throw new ArgumentException($"Playground '{id}' belongs to domain '{playground.DomainId}', which is not in the project.");
            if (!keys.Add($"{playground.DomainId}\u0000{id}"))
                throw new ArgumentException($"Playground '{id}' appears more than once in domain '{playground.DomainId}'.");
            return playground;
        }).ToList();
    }

    private static List<QueryRequestRecordDto> NormalizeImportedQueries(IReadOnlyList<JsonElement> queries)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        return queries.Select(query =>
        {
            if (query.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("A saved query must be a JSON object.");
            var idValue = query.EnumerateObject()
                .FirstOrDefault(property => property.Name.Equals("id", StringComparison.OrdinalIgnoreCase)).Value;
            var id = RequireSafeId(idValue.ValueKind == JsonValueKind.String ? idValue.GetString() : null, "Query");
            if (!ids.Add(id))
                throw new ArgumentException($"Query '{id}' appears more than once.");
            return new QueryRequestRecordDto(id, query.GetRawText(), false);
        }).ToList();
    }

    /// <summary>
    /// Trims names and rejects duplicates or dangling references. Names are matched exactly, as the resolver does.
    /// </summary>
    private static DomainDto NormalizeMetadata(DomainDto domain)
    {
        var entityNames = new HashSet<string>(StringComparer.Ordinal);
        var entities = new List<EntityDto>();
        foreach (var entity in domain.Entities)
        {
            var entityName = RequireName(entity.Name, "Entity");
            if (!entityNames.Add(entityName))
                throw new ArgumentException($"Entity '{entityName}' appears more than once.");

            var fieldNames = new HashSet<string>(StringComparer.Ordinal);
            var fields = entity.Fields.Select(field =>
            {
                var fieldName = RequireName(field.Name, "Field");
                if (!fieldNames.Add(fieldName))
                    throw new ArgumentException($"Field '{fieldName}' appears more than once in entity '{entityName}'.");
                return field with { Name = fieldName, DbColumn = field.DbColumn?.Trim() };
            }).ToList();
            entities.Add(entity with { Name = entityName, Fields = fields, RawSql = entity.RawSql?.Trim() ?? string.Empty });
        }

        var relations = domain.Relations.Select(relation =>
        {
            var relationName = RequireName(relation.SourceRelationName, "Source relation");
            var sourceFields = NormalizeKeyColumns(relation.SourceFields, relationName);
            var targetFields = NormalizeKeyColumns(relation.TargetFields, relationName);
            if (sourceFields.Count != targetFields.Count)
                throw new ArgumentException($"Relation '{relationName}' must map the same number of source and target columns.");
            return relation with
            {
                SourceEntity = RequireKnownEntity(relation.SourceEntity, entityNames, relationName),
                SourceRelationName = relationName,
                SourceFields = sourceFields,
                TargetEntity = RequireKnownEntity(relation.TargetEntity, entityNames, relationName),
                TargetRelationName = RequireName(relation.TargetRelationName, "Target relation"),
                TargetFields = targetFields,
            };
        }).ToList();

        return new DomainDto { Entities = entities, Relations = relations };
    }

    private static string RequireKnownEntity(string? entity, HashSet<string> entityNames, string relationName)
    {
        var name = RequireName(entity, "Relation entity");
        if (!entityNames.Contains(name))
            throw new ArgumentException($"Relation '{relationName}' references entity '{name}', which is not in the domain.");
        return name;
    }

    private static List<string> NormalizeKeyColumns(IEnumerable<string> columns, string relationName)
    {
        var normalized = columns.Select(column => RequireText(column, $"Key column of relation '{relationName}'")).ToList();
        if (normalized.Count == 0)
            throw new ArgumentException($"Relation '{relationName}' must map at least one column.");
        return normalized;
    }

    /// <summary>Responses never include the encrypted connection string, only its DBMS.</summary>
    private static ProjectFileDto WithoutCiphertext(ProjectFileDto project)
        => project.Connection is null
            ? project
            : project with { Connection = project.Connection with { EncryptedConnectionString = string.Empty } };

    private static DomainDto Normalize(DomainDto domain, string id)
    {
        var metadata = NormalizeMetadata(domain);
        return new()
        {
            Id = id,
            Name = RequireName(domain.Name, "Domain"),
            Description = domain.Description ?? string.Empty,
            Entities = metadata.Entities,
            Relations = metadata.Relations,
        };
    }

    private void EnsureDomainNameAvailable(string projectId, DomainDto domain, string? currentId)
    {
        if (repository.GetDomains(SectionId(), projectId).Any(existing =>
            !existing.Id.Equals(currentId, StringComparison.OrdinalIgnoreCase)
            && existing.Name.Equals(domain.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A domain named '{domain.Name}' already exists.");
    }

    /// <summary>Maps every table and foreign key in the schema to an entity and relation of the Main domain.</summary>
    private static DomainDto BuildMainDomain(DatabaseSchema schema)
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

        return new DomainDto
        {
            Id = MainDomainId,
            Name = MainDomainName,
            Description = MainDomainDescription,
            Entities = entities,
            Relations = relations,
        };
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
