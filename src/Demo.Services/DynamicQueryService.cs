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

    public QueryDefinition ParseQueryRequestString(string text, string entity)
    {
        if (IsOQueryText(text))
        {
            var query = QueryDefinitionOQueryParser.Parse(text);
            if (!string.Equals(query.Entity, entity, StringComparison.Ordinal))
                throw new FormatException("Entity cannot be changed in the request structure.");
            return query;
        }

        var textLines = text.Split(["\r\n", "\n"], StringSplitOptions.None);
        var lines = new List<(string Key, string Value)>();
        foreach (var line in textLines)
        {
            if (line.Length > 0 && char.IsWhiteSpace(line[0]))
            {
                if (lines.Count == 0)
                    throw new FormatException($"Invalid query request line [{line}].");
                var previous = lines[^1];
                lines[^1] = (previous.Key, $"{previous.Value}\n{line.Trim()}");
                continue;
            }

            var separator = line.IndexOf(':');
            if (separator < 1)
            {
                if (lines.Count == 0)
                    throw new FormatException($"Invalid query request line [{line}].");
                var previous = lines[^1];
                lines[^1] = (previous.Key, $"{previous.Value}\n{line}");
                continue;
            }

            var value = line[(separator + 1)..];
            if (value.StartsWith(' '))
                value = value[1..];
            lines.Add((line[..separator].Trim(), value));
        }
        if (lines.GroupBy(item => item.Key, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
            throw new FormatException("Query request fields must not be repeated.");
        var values = lines.ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);

        var resolvedEntity = values.GetValueOrDefault("Entity")
            ?? throw new FormatException("Query request requires an Entity.");
        if (!string.Equals(resolvedEntity, entity, StringComparison.Ordinal))
            throw new FormatException("Entity cannot be changed in the request structure.");

        var projection = QueryDefinitionJsonParser.ParseProjection(values.GetValueOrDefault("Projections") ?? string.Empty);
        var sorts = ParseSorts(values.GetValueOrDefault("Sorts"));

        if (values.ContainsKey("Filter") && values.ContainsKey("Filters"))
            throw new FormatException("Use either Filter or Filters, not both.");
        var filterText = values.GetValueOrDefault("Filter") ?? values.GetValueOrDefault("Filters");
        var filter = string.IsNullOrWhiteSpace(filterText)
            ? null
            : QueryDefinitionJsonParser.ParseFilter(ConvertFilterExpression(filterText));

        var page = ParseNullableInt(values.GetValueOrDefault("Page"), "Page");
        var pageSize = ParseNullableInt(values.GetValueOrDefault("PageSize"), "PageSize");
        if (page is < 1 || pageSize is < 1)
            throw new FormatException("Page and PageSize must be greater than zero.");

        return new QueryDefinition(resolvedEntity)
        {
            Projections = projection,
            Filter = filter,
            Sorts = sorts,
            Skip = page.HasValue && pageSize.HasValue ? (page.Value - 1) * pageSize.Value : null,
            Take = pageSize
        };
    }

    public QueryDefinition ParseQueryRequestString(string text)
    {

        logger.LogInformation($"\n---\n{text}\n---");
        if (IsOQueryText(text))
            return QueryDefinitionOQueryParser.Parse(text);

        var entity = text.Split(["\r\n", "\n"], StringSplitOptions.None)
            .Select(line => line.Trim())
            .FirstOrDefault(line => line.StartsWith("Entity:", StringComparison.OrdinalIgnoreCase));
        if (entity is not null)
            return ParseQueryRequestString(text, entity[(entity.IndexOf(':') + 1)..].Trim());

        throw new FormatException("Query request requires an Entity.");
    }

    private static bool IsOQueryText(string text)
        => text.Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .FirstOrDefault() is { } first
            && !first.StartsWith("Entity:", StringComparison.OrdinalIgnoreCase)
            && first.Contains(':', StringComparison.Ordinal);

    private static List<SortDefinition> ParseSorts(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? []
            : SplitTopLevel(value, ',').Select(item =>
            {
                var sortText = item.Trim();
                var direction = QuerySortDirection.Ascending;
                if (sortText.EndsWith(" ASC", StringComparison.OrdinalIgnoreCase))
                    sortText = sortText[..^4].TrimEnd();
                else if (sortText.EndsWith(" DESC", StringComparison.OrdinalIgnoreCase))
                {
                    sortText = sortText[..^5].TrimEnd();
                    direction = QuerySortDirection.Descending;
                }

                if (string.IsNullOrWhiteSpace(sortText))
                    throw new FormatException($"Invalid sort definition [{item}].");

                return new SortDefinition(QueryDefinitionJsonParser.ParseField(sortText), direction);
            }).ToList();

    private static List<string> SplitTopLevel(string text, char delimiter)
    {
        var parts = new List<string>();
        var start = 0;
        var parentheses = 0;
        var brackets = 0;
        var constraints = 0;

        for (var index = 0; index < text.Length; index++)
        {
            switch (text[index])
            {
                case '(':
                    parentheses++;
                    break;
                case ')':
                    parentheses--;
                    break;
                case '[':
                    brackets++;
                    break;
                case ']':
                    brackets--;
                    break;
                case '<':
                    constraints++;
                    break;
                case '>':
                    if (constraints > 0)
                        constraints--;
                    break;
            }

            if (text[index] == delimiter && parentheses == 0 && brackets == 0 && constraints == 0)
            {
                parts.Add(text[start..index].Trim());
                start = index + 1;
            }
        }

        parts.Add(text[start..].Trim());
        return parts.Where(part => part.Length > 0).ToList();
    }

    private static int? ParseNullableInt(string? value, string fieldName)
        => string.IsNullOrWhiteSpace(value)
            ? null
            : int.TryParse(value, System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture, out var result)
                ? result
                : throw new FormatException($"{fieldName} must be an integer or blank.");

    private static string ConvertFilterExpression(string expression)
    {
        var converted = new System.Text.StringBuilder();
        for (var index = 0; index < expression.Length; index++)
        {
            var current = expression[index];
            if (current == '"')
            {
                converted.Append('\'');
                index++;
                while (index < expression.Length)
                {
                    if (expression[index] == '"' && index + 1 < expression.Length && expression[index + 1] == '"')
                    {
                        converted.Append('"');
                        index += 2;
                        continue;
                    }
                    if (expression[index] == '"')
                        break;
                    if (expression[index] == '\'')
                    {
                        converted.Append("''");
                        index++;
                    }
                    else
                        converted.Append(expression[index++]);
                }
                if (index >= expression.Length)
                    throw new FormatException("Unterminated quoted filter value.");
                converted.Append('\'');
                continue;
            }

            if (char.IsLetter(current))
            {
                var start = index;
                while (index + 1 < expression.Length && char.IsLetter(expression[index + 1]))
                    index++;
                var word = expression[start..(index + 1)];
                converted.Append(word.Equals("AND", StringComparison.OrdinalIgnoreCase) ? "&&"
                    : word.Equals("OR", StringComparison.OrdinalIgnoreCase) ? "||"
                    : word);
                continue;
            }

            if (current == '<' && index + 1 < expression.Length && expression[index + 1] == '>')
            {
                converted.Append("!=");
                index++;
                continue;
            }

            if (current == '=' && (index == 0 || expression[index - 1] is not '<' and not '>' and not '!')
                && (index + 1 >= expression.Length || expression[index + 1] != '='))
            {
                converted.Append("==");
                continue;
            }

            converted.Append(current);
        }

        return converted.ToString();
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

        return new TableDataDto(
            Name: preparedQuery.Entity,
            Columns: string.Join(",", preparedQuery.Projections.Select(field => field.Alias ?? field.ToText())),
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
        var definition = ParseQueryRequestString(text);
        if (definition.Contexts?.TryGetValue(contextName, out var context) != true)
            throw new KeyNotFoundException($"Query context [{contextName}] was not found.");

        return ExecuteQueryAsync(new QueryDefinition(context.Entity)
        {
            Projections = context.Projections,
            Filter = context.Filter,
            Sorts = context.Sorts,
            Take = context.Take,
            Skip = context.Skip,
            Joins = context.Joins,
            Contexts = definition.Contexts,
        }, cancellationToken);
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
