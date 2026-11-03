using Demo.Contracts.Services;
using Microsoft.Extensions.Logging;
using OQuery;
using OQuery.QueryDefinitions.Parsers;

namespace Demo.Services;

public sealed class DynamicQueryService(
    IDbConnectionService dbConnectionService,
    IMetadataService metadataService,
    IOperatorDefinitionService operatorDefinitionService,
    ILogger<DynamicQueryService> logger) : IDynamicQueryService
{
    public string GetSqlQueryString(QueryDefinition query)
    {
        using var connection = dbConnectionService.CreateConnection();
        var dialect = SqlDialect.ForProvider(dbConnectionService.GetCurrentProvider(), connection);
        var metadataProvider = metadataService.GetMetaProvider();
        using var context = new OQueryEngine(
            connection,
            metadataProvider,
            metadataService.GetFunctionProvider(dialect),
            dialect);
        var preparedQuery = EnsureDefaultProjection(PrepareQuery(query, dialect), metadataProvider);
        return context.Query(preparedQuery).ToSql().CommandText;
    }

    public async Task<TableDataDto> ExecuteQueryAsync(
        QueryDefinition query,
        CancellationToken cancellationToken = default)
    {

        logger.LogInformation("\n{query}\n", query);

        using var connection = dbConnectionService.CreateConnection();
        var dialect = SqlDialect.ForProvider(dbConnectionService.GetCurrentProvider(), connection);
        var metadataProvider = metadataService.GetMetaProvider();
        using var context = new OQueryEngine(
            connection,
            metadataProvider,
            metadataService.GetFunctionProvider(dialect),
            dialect);
        var preparedQuery = EnsureDefaultProjection(PrepareQuery(query, dialect), metadataProvider);
        var result = await context.Query(preparedQuery)
            .ToListWithTotalRecordsAsync(cancellationToken);
       
        logger.LogInformation("Dynamic query returned {TotalRecords} total records.", result.TotalRecords);

        return new TableDataDto(
            Name: preparedQuery.Entity,
            Columns: string.Join(",", preparedQuery.Projection.Select(field => field.Alias ?? field.ToText())),
            Rows: result.Records.Select(row => string.Join(",", row.Select(value => value.Value))).ToArray(),
            Page: query.Page,
            PageSize: query.PageSize,
            TotalRecords: result.TotalRecords);
    }

    private static QueryDefinition EnsureDefaultProjection(
        QueryDefinition query,
        IMetadataProvider metadataProvider)
    {
        if (query.Projection is { Count: > 0 } || query.Contexts is { Count: > 0 })
            return query;

        var entity = metadataProvider.GetEntity(query.Entity);
        var projection = metadataProvider.GetFields(entity)
            .Select(field => new ProjectionDefinition(field.Name))
            .ToList();
        return query with { Projection = projection };
    }

    private QueryDefinition PrepareQuery(QueryDefinition query, ISqlDialect dialect)
    {
        ArgumentNullException.ThrowIfNull(query);
        QueryDefinitionParser.ValidateContextReferences(query);
        if (query.Filter is null
            && query.Contexts is not { Count: > 0 }
            && query.Relations is not { Count: > 0 })
            return query;

        var customOperators = operatorDefinitionService.GetAll()
            .Where(definition => !definition.IsBuiltin)
            .ToDictionary(definition => definition.Id, StringComparer.OrdinalIgnoreCase);
        var provider = dialect.Key;

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
                ConditionStatementDefinition { OperatorId: { } id } item =>
                    PrepareOperator(item, id, customOperators, provider),
                ConditionStatementDefinition item => item,
                _ => throw new NotSupportedException(
                    $"Unsupported filter definition [{condition.GetType().Name}].")
            };

        QueryDefinitionBase PrepareContext(QueryDefinitionBase context)
            => new QueryDefinitionBase
            {
                Entity = context.Entity,
                Projection = context.Projection,
                Filter = context.Filter is null ? null : PrepareGroup(context.Filter),
                Sorts = context.Sorts,
                Page = context.Page,
                PageSize = context.PageSize,
                Recursive = context.Recursive,
                Relations = context.Relations?
                    .Select(relation => relation with
                    {
                        Condition = relation.Condition is null ? null : PrepareCondition(relation.Condition)
                    })
                    .ToList() ?? []
            };

        return new QueryDefinition
        {
            Entity = query.Entity,
            Projection = query.Projection,
            Filter = query.Filter is null ? null : PrepareGroup(query.Filter),
            Sorts = query.Sorts,
            Page = query.Page,
            PageSize = query.PageSize,
            Contexts = query.Contexts?.ToDictionary(
                context => context.Key,
                context => PrepareContext(context.Value)),
            Relations = query.Relations?
                .Select(relation => relation with
                {
                    Condition = relation.Condition is null ? null : PrepareCondition(relation.Condition)
                })
                .ToList() ?? []
        };
    }

    private static ConditionStatementDefinition PrepareOperator(
        ConditionStatementDefinition filter,
        string operatorId,
        IReadOnlyDictionary<string, Demo.Contracts.Dto.OperatorDefinitionDto> operators,
        string provider)
    {
        if (!operators.TryGetValue(operatorId, out var definition))
            throw new KeyNotFoundException($"Custom operator '{operatorId}' was not found.");
        if (!definition.SqlTemplates.TryGetValue(provider, out var template))
            throw new InvalidOperationException(
                $"Operator '{definition.Name}' has no SQL template for provider '{provider}'.");

        return filter with { CustomSqlTemplate = template };
    }
}
