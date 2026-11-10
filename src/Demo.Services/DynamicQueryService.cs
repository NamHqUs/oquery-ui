using Demo.Contracts.Services;
using Microsoft.Extensions.Logging;
using OQuery;
using OQuery.QueryDefinitions.Parsers;

namespace Demo.Services;

public sealed class DynamicQueryService(
    IDbConnectionService dbConnectionService,
    IBusinessScopeService businessScopeService,
    IMetadataService metadataService,
    IOperatorDefinitionService operatorDefinitionService,
    ILogger<DynamicQueryService> logger) : IDynamicQueryService
{
    public string GetQueryRequestString(QueryDefinition query)
        => QueryDefinitionOQueryParser.Write(query);

    public QueryDefinition ParseQueryRequestString(string text)
    {
        logger.LogInformation($"\n---\n{text}\n---");
        return QueryDefinitionOQueryParser.Parse(text);
    }

    public string GetSqlQueryString(QueryDefinition query, string? scopeName)
    {
        using var connection = dbConnectionService.CreateConnection();
        var dialect = SqlDialect.ForProvider(dbConnectionService.GetCurrentProvider(), connection);
        var metadataProvider = businessScopeService.GetMetadataProvider(scopeName);
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
        string? scopeName,
        CancellationToken cancellationToken = default)
    {

        logger.LogInformation("\n---\n{query}\n---", query.ToText());

        using var connection = dbConnectionService.CreateConnection();
        var dialect = SqlDialect.ForProvider(dbConnectionService.GetCurrentProvider(), connection);
        var metadataProvider = businessScopeService.GetMetadataProvider(scopeName);
        using var context = new OQueryEngine(
            connection,
            metadataProvider,
            metadataService.GetFunctionProvider(dialect),
            dialect);
        var preparedQuery = EnsureDefaultProjection(PrepareQuery(query, dialect), metadataProvider);
        var result = await context.Query(preparedQuery)
            .ToListWithTotalRecordsAndColumnsAsync(cancellationToken);
       
        logger.LogInformation("Dynamic query returned {TotalRecords} total records.", result.TotalRecords);

        var data = new TableDataDto(
            Name: preparedQuery.Entity,
            Columns: string.Join(",", result.Columns),
            Rows: result.Records.Select(row => string.Join(",", row.Select(value => value.Value))).ToArray(),
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
        string? scopeName,
        CancellationToken cancellationToken = default)
    {
        var definition = QueryDefinitionOQueryParser.Parse(text, contextName);
        return ExecuteQueryAsync(definition, scopeName, cancellationToken);
    }

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

    private QueryDefinition PrepareQuery(QueryDefinition query, ISqlDialect dialect)
    {
        ArgumentNullException.ThrowIfNull(query);
        QueryDefinitionJsonParser.ValidateContextReferences(query);
        if (query.Filter is null
            && query.Contexts is not { Count: > 0 }
            && query.Joins is not { Count: > 0 })
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
