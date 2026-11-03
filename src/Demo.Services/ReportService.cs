using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using Demo.Contracts.Application;
using Demo.Contracts.Dto;
using OQuery;
using OQuery.QueryDefinitions.Parsers;
using System.Globalization;
using System.Text.Json;

namespace Demo.Services;

public sealed class ReportService(
    IReportRepository repository,
    IUserSectionManager userSectionManager) : IReportService
{
    public IReadOnlyList<ReportDto> ListReports()
    {
        var sectionId = userSectionManager.GetSectionId();
        return GetBuiltinReports()
            .Concat(GetUserDefinedQueryRequests(sectionId))
            .ToArray();
    }

    public ReportDto SaveReport(
        QueryDefinition query,
        string? fileName = null,
        string? requestText = null,
        string? description = null,
        string? chartType = null)
    {
        QueryDefinitionParser.ValidateContextReferences(query);
        var sectionId = userSectionManager.GetSectionId();
        fileName ??= repository.CreateId(sectionId);
        EnsureNotBuiltin(fileName);
        var report = new ReportDto(fileName, query, requestText, description, chartType);
        repository.Save(sectionId, report);
        return report;
    }

    public ReportDto? GetReport(string fileName)
    {
        var sectionId = userSectionManager.GetSectionId();
        EnsureNoBuiltinConflict(sectionId);
        return GetBuiltinReports().FirstOrDefault(report =>
                string.Equals(report.FileName, fileName, StringComparison.OrdinalIgnoreCase))
            ?? repository.Get(sectionId, fileName);
    }

    public string GetQueryRequestString(QueryDefinition query)
        => query.ToString();

    public QueryDefinition ParseQueryRequestString(string text, string entity)
    {
        var textLines = text.Split(["\r\n", "\n"], StringSplitOptions.None);
        var projectionHeader = Array.FindIndex(textLines, line =>
            line.Trim().Equals("Projection:", StringComparison.OrdinalIgnoreCase));
        if (projectionHeader < 0)
            projectionHeader = Array.FindIndex(textLines, line =>
                line.Trim().Equals("Fields:", StringComparison.OrdinalIgnoreCase));
        var hasYamlProjectionList = projectionHeader >= 0 && textLines
            .Skip(projectionHeader + 1)
            .TakeWhile(line => string.IsNullOrWhiteSpace(line) || char.IsWhiteSpace(line[0]))
            .Any(line => line.TrimStart().StartsWith("- ", StringComparison.Ordinal));
        if (hasYamlProjectionList)
        {
            var query = QueryDefinitionParser.ParseFromYml(text);
            if (!string.Equals(query.Entity, entity, StringComparison.Ordinal))
                throw new FormatException("Entity cannot be changed in the request structure.");
            return query;
        }

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

        var projectionText = values.GetValueOrDefault("Projection") ?? values.GetValueOrDefault("Fields");
        var projection = QueryDefinitionParser.ParseProjection(projectionText ?? string.Empty);
        var sorts = ParseSorts(values.GetValueOrDefault("Sorts"));

        if (values.ContainsKey("Filter") && values.ContainsKey("Filters"))
            throw new FormatException("Use either Filter or Filters, not both.");
        var filterText = values.GetValueOrDefault("Filter") ?? values.GetValueOrDefault("Filters");
        var filter = string.IsNullOrWhiteSpace(filterText)
            ? null
            : QueryDefinitionParser.ParseFilter(ConvertFilterExpression(filterText));

        var page = ParseNullableInt(values.GetValueOrDefault("Page"), "Page");
        var pageSize = ParseNullableInt(values.GetValueOrDefault("PageSize"), "PageSize");
        if (page is < 1 || pageSize is < 1)
            throw new FormatException("Page and PageSize must be greater than zero.");

        return new QueryDefinition
        {
            Entity = resolvedEntity,
            Projection = projection,
            Filter = filter,
            Sorts = sorts,
            Page = page,
            PageSize = pageSize
        };
    }

    public QueryDefinition ParseQueryRequestString(string text)
    {
        var entity = text.Split(["\r\n", "\n"], StringSplitOptions.None)
            .Select(line => line.Trim())
            .FirstOrDefault(line => line.StartsWith("Entity:", StringComparison.OrdinalIgnoreCase));
        if (entity is not null)
            return ParseQueryRequestString(text, entity[(entity.IndexOf(':') + 1)..].Trim());

        throw new FormatException("Query request requires an Entity.");
    }

    public ReportDto? UpdateReport(
        string fileName,
        QueryDefinition query,
        string? requestText = null,
        string? description = null,
        string? chartType = null)
    {
        QueryDefinitionParser.ValidateContextReferences(query);
        var sectionId = userSectionManager.GetSectionId();
        EnsureNoBuiltinConflict(sectionId);
        if (IsBuiltin(fileName) || repository.Get(sectionId, fileName) is null)
            return null;

        var report = new ReportDto(fileName, query, requestText, description, chartType);
        repository.Save(sectionId, report);
        return report;
    }

    public bool DeleteReport(string fileName)
    {
        var sectionId = userSectionManager.GetSectionId();
        EnsureNoBuiltinConflict(sectionId);
        return !IsBuiltin(fileName) && repository.Delete(sectionId, fileName);
    }

    private IReadOnlyList<ReportDto> GetBuiltinReports() => repository.GetBuiltin().ToArray();

    private IReadOnlyList<ReportDto> GetUserDefinedQueryRequests(string userSectionId)
    {
        var builtinNames = GetBuiltinReports()
            .Select(report => report.FileName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var userDefined = repository.GetUserDefined(userSectionId);
        var conflict = userDefined.FirstOrDefault(request => builtinNames.Contains(request.FileName));
        if (conflict is not null)
            throw new InvalidDataException(
                $"User query request '{conflict.FileName}' cannot replace a built-in request.");
        return userDefined.ToArray();
    }

    private void EnsureNoBuiltinConflict(string userSectionId)
        => _ = GetUserDefinedQueryRequests(userSectionId);

    private bool IsBuiltin(string fileName)
        => GetBuiltinReports().Any(report =>
            string.Equals(report.FileName, fileName, StringComparison.OrdinalIgnoreCase));

    private void EnsureNotBuiltin(string fileName)
    {
        if (IsBuiltin(fileName))
            throw new InvalidOperationException($"Built-in query request '{fileName}' cannot be changed.");
    }

    private static JsonSerializerOptions JsonOptions(bool writeIndented = false)
        => new()
        {
            WriteIndented = writeIndented,
            Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter<DataType>() }
        };

    private static List<T> ParseList<T>(string? value, Func<string, T> parse)
        => string.IsNullOrWhiteSpace(value)
            ? []
            : value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(parse).ToList();

    private static List<SortDefinition> ParseSorts(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? []
            : SplitTopLevel(value, ',').Select(item =>
            {
                var sortText = item.Trim();
                var direction = QuerySortDirection.Ascending;
                if (sortText.EndsWith(" ASC", StringComparison.OrdinalIgnoreCase))
                {
                    sortText = sortText[..^4].TrimEnd();
                }
                else if (sortText.EndsWith(" DESC", StringComparison.OrdinalIgnoreCase))
                {
                    sortText = sortText[..^5].TrimEnd();
                    direction = QuerySortDirection.Descending;
                }

                if (string.IsNullOrWhiteSpace(sortText))
                    throw new FormatException($"Invalid sort definition [{item}].");

                return new SortDefinition(QueryDefinitionParser.ParseField(sortText), direction);
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
            : int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result)
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
                    {
                        converted.Append(expression[index++]);
                    }
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
}
