using OQuery.UI.Abstracts.Services;
using OQuery.Database;
using OQuery;
using OQuery.QueryDefinitions.Parsers;

namespace OQuery.UI.Services;

public sealed class DynamicQueryService(
    IDbConnectionService dbConnectionService,
    IProjectService projectService,
    IFunctionDefinitionService functionDefinitionService,
    ILogger<DynamicQueryService> logger) : IDynamicQueryService
{
    public string GetQueryRequestString(QueryDefinition query)
        => QueryDefinitionOQueryParser.Write(query);

    public QueryDefinition ParseQueryRequestString(string text)
    {
        logger.LogInformation($"\n---\n{text}\n---");
        return QueryDefinitionOQueryParser.Parse(text);
    }

    public string GetSqlQueryString(QueryDefinition query, string projectId, string domainId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(projectId);
        ArgumentException.ThrowIfNullOrWhiteSpace(domainId);
        using var connection = dbConnectionService.CreateConnection();
        var provider = dbConnectionService.GetCurrentProvider();
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        var dialect = SqlDialectFactory.ForProvider(provider);
        var metadataProvider = CreateMetadataProvider(projectId, domainId, provider);
        ValidateQueryEntities(query, metadataProvider, domainId);
        using var context = new OQueryEngine(
            connection,
            metadataProvider,
            CreateFunctionProvider(dialect, projectId),
            dialect);
        var preparedQuery = EnsureDefaultProjection(PrepareQuery(query, metadataProvider), metadataProvider);
        return context.Query(preparedQuery).ToSql().CommandText;
    }

    public async Task<TableDataDto> ExecuteQueryAsync(
        QueryDefinition query,
        string projectId,
        string domainId,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("\n---\n{query}\n---", query.ToText());

        using var connection = dbConnectionService.CreateConnection();
        var provider = dbConnectionService.GetCurrentProvider();
        ArgumentException.ThrowIfNullOrWhiteSpace(provider);
        var dialect = SqlDialectFactory.ForProvider(provider);
        var metadataProvider = CreateMetadataProvider(projectId, domainId, provider);
        ValidateQueryEntities(query, metadataProvider, domainId);
        using var context = new OQueryEngine(
            connection,
            metadataProvider,
            CreateFunctionProvider(dialect, projectId),
            dialect);
        var preparedQuery = EnsureDefaultProjection(PrepareQuery(query, metadataProvider), metadataProvider);
        var result = await context.Query(preparedQuery)
            .ToListWithTotalRecordsAndColumnsAsync(cancellationToken);
       
        logger.LogInformation("Dynamic query returned {TotalRecords} total records.", result.TotalRecords);

        var data = new TableDataDto(
            Name: preparedQuery.Entity,
            Columns: result.Columns.ToArray(),
            Rows: result.Records.Select(row => row.Select(value => value.Value?.ToString() ?? string.Empty).ToArray()).ToArray(),
            Page: query.Skip is { } skip && query.Take is { } take
                ? skip / take + 1
                : null,
            PageSize: query.Take,
            TotalRecords: result.TotalRecords);

        logger.LogInformation(data.ToString());
        return data;
    }

    public Task<TableDataDto> ExecuteContextQueryAsync(
        string text,
        string contextName,
        string projectId,
        string domainId,
        CancellationToken cancellationToken = default)
    {
        var definition = QueryDefinitionOQueryParser.Parse(text, contextName);
        return ExecuteQueryAsync(definition, projectId, domainId, cancellationToken);
    }

    public string GetContextSqlQueryString(string text, string contextName, string projectId, string domainId)
        => GetSqlQueryString(QueryDefinitionOQueryParser.Parse(text, contextName), projectId, domainId);

    private IFunctionProvider CreateFunctionProvider(ISqlDialect dialect, string projectId)
        => new FunctionProvider(
            dialect,
            functionDefinitionService.GetAll(projectId).Select(definition => definition.ToFunctionDefinition()));

    private static QueryDefinition EnsureDefaultProjection(
        QueryDefinition query,
        IMetadataProvider metadataProvider)
    {
        if (query.Projections is { Count: > 0 })
            return query;

        var entity = metadataProvider.GetEntity(query.Entity);
        var projection = metadataProvider.GetFields(entity)
            .Select(field => new ProjectionDefinition(field.Name))
            .ToList();
        return query with { Projections = projection };
    }

    private MetadataProvider CreateMetadataProvider(string projectId, string domainId, string? provider)
    {
        var entities = projectService.ResolveMetadata(projectId, domainId).ToList();
        if (!string.Equals(provider, "Sqlite", StringComparison.OrdinalIgnoreCase))
            return new MetadataProvider(entities);

        return new MetadataProvider(entities
            .Select(entity => string.Equals(entity.DbSchema, "dbo", StringComparison.OrdinalIgnoreCase)
                ? entity with { DbSchema = null }
                : entity)
            .ToArray());
    }

    private static void ValidateQueryEntities(
        QueryDefinition query,
        MetadataProvider metadataProvider,
        string domainId)
    {
        var entities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var pending = new Queue<QueryDefinitionBase>([query]);
        while (pending.Count > 0)
        {
            var current = pending.Dequeue();
            if (!entities.Add(current.Entity))
                continue;

            try
            {
                metadataProvider.GetEntity(current.Entity);
            }
            catch (EntityNotFoundException)
            {
                throw new ArgumentException(
                    $"Entity [{current.Entity}] does not exist in domain [{domainId}].",
                    nameof(query));
            }

            if (current is QueryDefinition { Contexts: { } contexts })
                foreach (var context in contexts.Values)
                    pending.Enqueue(context);
        }
    }

    private static bool IsEntityName(IMetadataProvider metadataProvider, string name)
    {
        try
        {
            metadataProvider.GetEntity(name);
            return true;
        }
        catch (EntityNotFoundException)
        {
            return false;
        }
    }

    private QueryDefinition PrepareQuery(QueryDefinition query, IMetadataProvider metadataProvider)
    {
        ArgumentNullException.ThrowIfNull(query);
        QueryDefinitionJsonParser.ValidateContextReferences(query, name => IsEntityName(metadataProvider, name));
        if (query.Filter is null
            && query.Contexts is not { Count: > 0 }
            && query.Joins is not { Count: > 0 })
            return query;

        ConditionDefinition PrepareGroup(ConditionDefinition group)
            => new(group.LogicalOperation, System.Linq.Enumerable.Select<IConditionDefintion, IConditionDefintion>(
                group.Filters,
                PrepareCondition).ToArray())
            {
                Note = group.Note
            };

        IConditionDefintion PrepareCondition(IConditionDefintion condition)
            => condition switch
            {
                ConditionDefinition nested => PrepareGroup(nested),
                ConditionStatementDefinition item => item,
                FunctionCondition function => function,
                _ => throw new NotSupportedException(
                    $"Unsupported filter definition [{condition.GetType().Name}].")
            };

        QueryDefinitionBase PrepareContext(QueryDefinitionBase context)
            => new QueryDefinitionBase(context.Entity)
            {
                Projections = context.Projections,
                Filter = context.Filter is null ? null : PrepareGroup(context.Filter),
                Sorts = context.Sorts,
                Skip = context.Skip,
                Take = context.Take,
                Joins = context.Joins?
                    .Select(relation => relation with
                    {
                        Condition = relation.Condition is null ? null : PrepareCondition(relation.Condition)
                    })
                    .ToList() ?? []
            };

        return new QueryDefinition(query.Entity)
        {
            Projections = query.Projections,
            Filter = query.Filter is null ? null : PrepareGroup(query.Filter),
            Sorts = query.Sorts,
            Skip = query.Skip,
            Take = query.Take,
            Contexts = query.Contexts?.ToDictionary(
                context => context.Key,
                context => PrepareContext(context.Value)),
            Joins = query.Joins?
                .Select(relation => relation with
                {
                    Condition = relation.Condition is null ? null : PrepareCondition(relation.Condition)
                })
                .ToList() ?? []
        };
    }
}
