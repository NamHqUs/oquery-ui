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
    public string GetQueryRequestString(QueryDefinition query)
        => QueryDefinitionOQueryParser.Write(query);

    public QueryDefinition ParseQueryRequestString(string text)
    {
        logger.LogInformation($"\n---\n{text}\n---");
        var query = QueryDefinitionOQueryParser.Parse(text);
        ValidateMetadata(query);
        return query;
    }

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

        logger.LogInformation("\n---\n{query}\n---", query.ToText());

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

        var projections = preparedQuery.Projections ?? [];
        return new TableDataDto(
            Name: preparedQuery.Entity,
            Columns: string.Join(",", projections.Select(field => field.Alias ?? field.ToText())),
            Rows: result.Records.Select(row => string.Join(",", row.Select(value => value.Value))).ToArray(),
            Page: query.Skip is { } skip && query.Take is { } take
                ? skip / take + 1
                : null,
            PageSize: query.Take,
            TotalRecords: result.TotalRecords);
    }

    public Task<TableDataDto> ExecuteContextQueryAsync(
        string text,
        string contextName,
        CancellationToken cancellationToken = default)
    {
        var definition = QueryDefinitionOQueryParser.Parse(text, contextName);
        return ExecuteQueryAsync(definition, cancellationToken);
    }

    private static QueryDefinition EnsureDefaultProjection(
        QueryDefinition query,
        IMetadataProvider metadataProvider)
    {
        if (query.Projections is { Count: > 0 } || query.Contexts is { Count: > 0 })
            return query;

        var entity = metadataProvider.GetEntity(query.Entity);
        var projection = metadataProvider.GetFields(entity)
            .Select(field => new ProjectionDefinition(field.Name))
            .ToList();
        return query with { Projections = projection };
    }

    private void ValidateMetadata(QueryDefinition query)
    {
        var metadataProvider = metadataService.GetMetaProvider();
        var availableContexts = query.Contexts?.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase)
            ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        ValidateDefinition(query, metadataProvider, availableContexts);
    }

    private static void ValidateDefinition(
        QueryDefinitionBase definition,
        IMetadataProvider metadataProvider,
        IReadOnlySet<string> availableContexts)
    {
        var entity = TryGetEntity(definition.Entity, metadataProvider);
        if (entity is null && !availableContexts.Contains(definition.Entity))
            metadataProvider.GetEntity(definition.Entity);

        var aliases = (definition.Projections ?? [])
            .Where(projection => !string.IsNullOrWhiteSpace(projection.Alias))
            .Select(projection => projection.Alias!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (entity is not null)
        {
            foreach (var projection in definition.Projections ?? [])
                ValidateField(projection.Field, entity, metadataProvider, aliases, availableContexts);
            if (definition.Filter is not null)
                ValidateCondition(definition.Filter, entity, metadataProvider, aliases, availableContexts);
            foreach (var sort in definition.Sorts ?? [])
                ValidateField(sort.Field, entity, metadataProvider, aliases, availableContexts);
        }

        foreach (var join in definition.Joins ?? [])
            if (!availableContexts.Contains(join.RefContext))
                throw new FormatException(
                    $"Query relation references unknown context [{join.RefContext}].");

        if (definition is QueryDefinition query)
        {
            var nestedContexts = new HashSet<string>(availableContexts, StringComparer.OrdinalIgnoreCase);
            foreach (var name in query.Contexts?.Keys ?? Enumerable.Empty<string>())
                nestedContexts.Add(name);
            foreach (var context in query.Contexts?.Values ?? Enumerable.Empty<QueryDefinitionBase>())
                ValidateDefinition(context, metadataProvider, nestedContexts);
        }
    }

    private static void ValidateCondition(
        IConditionDefintion condition,
        IEntity entity,
        IMetadataProvider metadataProvider,
        IReadOnlySet<string> aliases,
        IReadOnlySet<string> availableContexts)
    {
        switch (condition)
        {
            case ConditionDefinition group:
                foreach (var filter in group.Filters)
                    ValidateCondition(filter, entity, metadataProvider, aliases, availableContexts);
                break;
            case ConditionStatementDefinition statement:
                ValidateField(statement.Left, entity, metadataProvider, aliases, availableContexts);
                if (statement.Right is not null)
                    ValidateField(statement.Right, entity, metadataProvider, aliases, availableContexts);
                break;
        }
    }

    private static void ValidateField(
        IFieldDefinition field,
        IEntity entity,
        IMetadataProvider metadataProvider,
        IReadOnlySet<string> aliases,
        IReadOnlySet<string> availableContexts)
    {
        switch (field)
        {
            case FieldDefinition value:
                ValidateFieldPath(value.FieldName, entity, metadataProvider, aliases, availableContexts);
                break;
            case FunctionFieldDefinition function:
                foreach (var argument in function.Arguments)
                    ValidateField(argument, entity, metadataProvider, aliases, availableContexts);
                break;
            case GroupFieldDefintion group:
                foreach (var item in group.Fields)
                    ValidateField(item, entity, metadataProvider, aliases, availableContexts);
                break;
            case ConditionFieldDefinition nested:
                ValidateCondition(nested.Condition, entity, metadataProvider, aliases, availableContexts);
                break;
        }
    }

    private static void ValidateFieldPath(
        string fieldPath,
        IEntity entity,
        IMetadataProvider metadataProvider,
        IReadOnlySet<string> aliases,
        IReadOnlySet<string> availableContexts)
    {
        if (fieldPath == "*" || aliases.Contains(fieldPath))
            return;

        var segments = fieldPath.Split('.');
        if (segments.Length == 1)
        {
            metadataProvider.GetField(entity, fieldPath);
            return;
        }

        var current = entity;
        for (var index = 0; index < segments.Length - 1; index++)
        {
            if (index == 0 && availableContexts.Contains(segments[index]))
                return;
            var relation = current.GetRelation(segments[index]);
            current = metadataProvider.GetEntity(relation.RefEntity);
        }
        metadataProvider.GetField(current, segments[^1]);
    }

    private static IEntity? TryGetEntity(string entityName, IMetadataProvider metadataProvider)
    {
        try
        {
            return metadataProvider.GetEntity(entityName);
        }
        catch (EntityNotFoundException)
        {
            return null;
        }
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
