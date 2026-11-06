using Demo.Contracts.Dto;
using Demo.Contracts.Services;
using OQuery;
using System.Text.RegularExpressions;

namespace Demo.Services;

public sealed class OQuerySuggestionService(
    IMetadataService metadataService,
    IFunctionDefinitionService functionDefinitionService) : IOQuerySuggestionService
{
    private static readonly IReadOnlyDictionary<string, string> ClauseKeywords =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Where"] = "Filter rows",
            ["Order"] = "Sort results",
            ["Skip"] = "Skip rows",
            ["Take"] = "Limit rows",
            ["Inner Join"] = "Join a context",
            ["Left Join"] = "Join a context",
            ["Right Join"] = "Join a context",
            ["Full Join"] = "Join a context",
            ["On"] = "Join condition",
        };

    private static readonly IReadOnlyDictionary<string, string> ExpressionKeywords =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["And"] = "Combine conditions",
            ["Or"] = "Combine conditions",
            ["Is"] = "Declare a reusable context",
            ["Asc"] = "Ascending sort",
            ["Desc"] = "Descending sort",
            ["In"] = "Match a value in a list",
            ["Between"] = "Match a value range",
            ["Not"] = "Negate an expression",
            ["Like"] = "Text pattern match",
            ["Contains"] = "Text contains match",
            ["Null"] = "Null value",
            ["True"] = "Boolean value",
            ["False"] = "Boolean value",
        };

    private static readonly IReadOnlyDictionary<string, string> Operators =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["="] = "Equals",
            [">"] = "Greater than",
            ["<"] = "Less than",
            [">="] = "Greater than or equal",
            ["<="] = "Less than or equal",
            ["!="] = "Not equal",
        };

    public OQuerySuggestionResponse GetSuggestions(OQuerySuggestionRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var text = request.Text ?? string.Empty;
        var offset = GetCursorOffset(text, request.Line, request.Column);
        var lineStart = text.LastIndexOf('\n', Math.Max(0, offset - 1)) + 1;
        var lineBeforeCursor = text[lineStart..offset];
        var token = GetReplacementToken(lineBeforeCursor, offset - lineStart, lineStart);
        var context = GetContext(lineBeforeCursor, text);
        var candidates = new List<Candidate>();
        var metadata = metadataService.GetAll();
        var dynamicNames = GetDynamicNames(text);

        if (context is CompletionContext.Document or CompletionContext.Header)
        {
            foreach (var entity in metadata)
                Add(candidates, entity.Name, "Entity", "entity", 0, context == CompletionContext.Document ? $"{entity.Name}: " : entity.Name);
            foreach (var name in dynamicNames.Contexts)
                Add(
                    candidates,
                    name,
                    "Dynamic context",
                    "context",
                    Regex.IsMatch(lineBeforeCursor, @"\bis\s*$", RegexOptions.IgnoreCase)
                        ? -10
                        : 5);
            if (context == CompletionContext.Header)
                Add(candidates, "Is", "Declare a reusable context", "keyword", 10, "Is ");
        }

        if (context is CompletionContext.Projection or CompletionContext.Where or CompletionContext.On or CompletionContext.Order)
        {
            foreach (var field in GetFields(metadata, lineBeforeCursor, text, offset, dynamicNames))
                Add(candidates, field.Label, field.Detail, field.Kind, 0);
            foreach (var alias in dynamicNames.Aliases)
                Add(
                    candidates,
                    alias,
                    "Alias from this query",
                    "alias",
                    context is CompletionContext.Where or CompletionContext.Order
                        ? -5
                        : 4);
        }

        switch (context)
        {
            case CompletionContext.Clause:
                foreach (var (label, detail) in ClauseKeywords)
                    Add(candidates, label, detail, "keyword", 0, $"{label} ");
                break;
            case CompletionContext.Where:
            case CompletionContext.On:
                foreach (var (label, detail) in ExpressionKeywords)
                    Add(candidates, label, detail, "keyword", 0, $"{label} ");
                foreach (var (label, detail) in Operators)
                    Add(candidates, label, detail, "operator", 5, $"{label} ");
                break;
            case CompletionContext.Order:
                Add(candidates, "Asc", "Ascending sort", "keyword", 0, "Asc ");
                Add(candidates, "Desc", "Descending sort", "keyword", 0, "Desc ");
                break;
            case CompletionContext.Join:
                foreach (var entity in metadata)
                    Add(candidates, entity.Name, "Join target", "entity", 0);
                foreach (var name in dynamicNames.Contexts)
                    Add(candidates, name, "Dynamic context", "context", 1);
                Add(candidates, "On", "Join condition", "keyword", 2, "On ");
                break;
            case CompletionContext.Value:
                Add(candidates, "<value>", "Value in angle brackets", "value", 0, "<value>");
                foreach (var label in new[] { "Null", "True", "False" })
                    Add(candidates, label, ExpressionKeywords[label], "keyword", 0, $"{label} ");
                break;
            case CompletionContext.Projection:
                foreach (var function in functionDefinitionService.GetAll())
                    Add(candidates, function.Name, function.IsAggregate ? "Aggregate function" : "Function", "function", 3, $"{function.Name}()");
                break;
        }

        var items = candidates
            .GroupBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderBy(item => item.Score).First())
            .Select(item => item with { Score = Score(item, token.Query) })
            .Where(item => !double.IsPositiveInfinity(item.Score))
            .OrderBy(item => item.Score)
            .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
            .Take(30)
            .Select(item => new OQuerySuggestionItem(item.Label, item.InsertText, item.Detail, item.Kind, item.SortOrder))
            .ToArray();

        return new OQuerySuggestionResponse(items, token.Start, offset, request.DocumentVersion);
    }

    private static int GetCursorOffset(string text, int line, int column)
    {
        if (line < 1 || column < 1)
            throw new ArgumentOutOfRangeException(nameof(line), "Cursor line and column are one-based and must be positive.");

        var currentLine = 1;
        var lineStart = 0;
        while (currentLine < line && lineStart < text.Length)
        {
            var nextLine = text.IndexOf('\n', lineStart);
            if (nextLine < 0)
            {
                lineStart = text.Length;
                break;
            }
            lineStart = nextLine + 1;
            currentLine++;
        }

        if (currentLine != line)
            throw new ArgumentOutOfRangeException(nameof(line), "Cursor line is outside the document.");
        return Math.Min(text.Length, lineStart + column - 1);
    }

    private static ReplacementToken GetReplacementToken(string line, int lineOffset, int documentLineStart)
    {
        var end = lineOffset;
        var start = end;
        while (start > 0 && (char.IsLetterOrDigit(line[start - 1]) || line[start - 1] == '_')) start--;
        return new ReplacementToken(documentLineStart + start, documentLineStart + end, line[start..end]);
    }

    private static CompletionContext GetContext(string line, string text)
    {
        var trimmed = line.TrimStart();
        var lower = trimmed.ToLowerInvariant();
        var indented = trimmed.Length != line.Length;
        if (string.IsNullOrWhiteSpace(text)) return CompletionContext.Document;
        if (lower.StartsWith("where ") || lower == "where") return EndsWithOperator(line) ? CompletionContext.Value : CompletionContext.Where;
        if (lower.StartsWith("order ") || lower == "order") return CompletionContext.Order;
        if (lower.StartsWith("on ") || lower == "on") return CompletionContext.On;
        if (lower.Contains(" join ")) return CompletionContext.Join;
        if (indented && !trimmed.Contains(' ')) return CompletionContext.Clause;
        if (!indented && !trimmed.Contains(':')) return CompletionContext.Header;
        if (trimmed.Contains(':')) return CompletionContext.Projection;
        return CompletionContext.Clause;
    }

    private static bool EndsWithOperator(string line)
        => line.TrimEnd().EndsWith('=') || line.TrimEnd().EndsWith('>') || line.TrimEnd().EndsWith('<');

    private static IEnumerable<FieldCandidate> GetFields(
        IReadOnlyList<MetadataEntityDto> metadata,
        string line,
        string text,
        int offset,
        DynamicNames dynamicNames)
    {
        var path = GetPath(line);
        var sourceName = GetCurrentSourceName(text, offset);
        if (path is null &&
            sourceName is not null &&
            dynamicNames.Sources.ContainsKey(sourceName) &&
            dynamicNames.ContextFields.TryGetValue(sourceName, out var contextFields))
        {
            return contextFields.Select(field => new FieldCandidate(field, "Context field", "field"));
        }

        if (path is null && sourceName is not null)
        {
            var sourceEntity = metadata.FirstOrDefault(entity =>
                string.Equals(entity.Name, sourceName, StringComparison.OrdinalIgnoreCase));
            if (sourceEntity is not null)
            {
                return sourceEntity.Fields
                    .Select(field => new FieldCandidate(field.Name, "Field", "field"))
                    .Concat(sourceEntity.Relations?.Select(relation =>
                        new FieldCandidate(relation.Name, $"{sourceName} relation", "relation"))
                        ?? []);
            }
        }

        var source = path is null
            ? metadata
            : ResolvePath(metadata, path, sourceName, dynamicNames);
        if (path is null)
        {
            var sourceEntity = sourceName is null
                ? null
                : metadata.FirstOrDefault(entity =>
                    string.Equals(entity.Name, sourceName, StringComparison.OrdinalIgnoreCase));
            if (sourceEntity is not null)
            {
                return sourceEntity.Fields
                    .Select(field => new FieldCandidate(field.Name, "Field", "field"))
                    .Concat(sourceEntity.Relations?.Select(relation =>
                        new FieldCandidate(relation.Name, $"Relation to {relation.RefEntity}", "relation"))
                        ?? []);
            }

            return metadata.SelectMany(entity => entity.Fields.Select(field => new FieldCandidate(field.Name, "Field", "field")));
        }

        return source.SelectMany(entity => entity.Fields.Select(field =>
            new FieldCandidate(field.Name, $"{path} field", "relation")));
    }

    private static IReadOnlyList<MetadataEntityDto> ResolvePath(
        IReadOnlyList<MetadataEntityDto> metadata,
        string path,
        string? sourceName,
        DynamicNames dynamicNames)
    {
        var segments = path.Split('.');
        var entityName = dynamicNames.Sources.TryGetValue(segments[0], out var contextSource)
            ? contextSource
            : metadata.Any(item => string.Equals(item.Name, segments[0], StringComparison.OrdinalIgnoreCase))
                ? segments[0]
                : sourceName;
        var entity = metadata.FirstOrDefault(item => string.Equals(item.Name, entityName, StringComparison.OrdinalIgnoreCase));
        var startIndex = entityName is not null &&
            string.Equals(entityName, segments[0], StringComparison.OrdinalIgnoreCase)
            ? 1
            : 0;
        for (var index = startIndex; entity is not null && index < segments.Length; index++)
        {
            var relation = entity.Relations?.FirstOrDefault(item =>
                string.Equals(item.Name, segments[index], StringComparison.OrdinalIgnoreCase));
            entity = relation is null
                ? null
                : metadata.FirstOrDefault(item => string.Equals(item.Name, relation.RefEntity, StringComparison.OrdinalIgnoreCase));
        }
        return entity is null ? [] : [entity];
    }

    private static string? GetCurrentSourceName(string text, int offset)
    {
        var current = text[..Math.Min(offset, text.Length)]
            .Split('\n')
            .LastOrDefault(line => Regex.IsMatch(
                line,
                @"^\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+is\s+[A-Za-z_][A-Za-z0-9_]*)?\s*:",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant));
        if (current is null) return null;

        var match = Regex.Match(
            current.Trim(),
            @"^(?<name>[A-Za-z_][A-Za-z0-9_]*)(?:\s+is\s+(?<source>[A-Za-z_][A-Za-z0-9_]*))?\s*:",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return match.Success
            ? match.Groups["source"].Success
                ? match.Groups["source"].Value
                : match.Groups["name"].Value
            : null;
    }

    private static string? GetPath(string line)
    {
        var end = line.Length;
        while (end > 0 && (char.IsLetterOrDigit(line[end - 1]) || line[end - 1] == '_')) end--;
        if (end == 0 || line[end - 1] != '.') return null;
        var start = end - 1;
        while (start > 0 && (char.IsLetterOrDigit(line[start - 1]) || line[start - 1] is '_' or '.')) start--;
        return line[start..(end - 1)];
    }

    private static DynamicNames GetDynamicNames(string text)
    {
        var contexts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var aliases = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var sources = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var contextFields = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        string? currentContext = null;
        foreach (var line in text.Split('\n'))
        {
            var trimmed = line.Trim();
            var colon = trimmed.IndexOf(':');
            if (colon > 0)
            {
                var header = trimmed[..colon].Trim();
                var contextDeclaration = Regex.Match(
                    header,
                    @"^(?<context>[A-Za-z_][A-Za-z0-9_]*)\s+is\s+(?<source>[A-Za-z_][A-Za-z0-9_]*)$",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
                var name = contextDeclaration.Success
                    ? contextDeclaration.Groups["context"].Value
                    : header;
                if (name.Length > 0) contexts.Add(name);
                if (contextDeclaration.Success)
                {
                    sources[name] = contextDeclaration.Groups["source"].Value;
                    entities.Add(contextDeclaration.Groups["source"].Value);
                }
                else
                    entities.Add(name);
                currentContext = name;
                if (!contextFields.ContainsKey(name))
                    contextFields[name] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                AddProjectionAliases(header.Length < trimmed.Length ? trimmed[(colon + 1)..] : string.Empty, contextFields[name], aliases);
                continue;
            }

            if (currentContext is not null && !IsClauseLine(trimmed))
                AddProjectionAliases(trimmed, contextFields[currentContext], aliases);

            var asIndex = trimmed.IndexOf(" as ", StringComparison.OrdinalIgnoreCase);
            if (asIndex >= 0)
            {
                var alias = trimmed[(asIndex + 4)..].Split(' ', '\t', ',', '#')[0];
                if (alias.Length > 0) aliases.Add(alias);
            }
        }
        return new DynamicNames(contexts, aliases, entities, sources, contextFields);
    }

    private static void AddProjectionAliases(
        string projection,
        ICollection<string> contextFields,
        ICollection<string> aliases)
    {
        foreach (var item in projection.Split(','))
        {
            var text = item.Trim();
            if (text.Length == 0) continue;
            var asAlias = Regex.Match(text, @"\bas\s+(?<alias>[A-Za-z_][A-Za-z0-9_]*)$", RegexOptions.IgnoreCase);
            var alias = asAlias.Success ? asAlias.Groups["alias"].Value : FindWhitespaceAlias(text);
            if (alias is null) continue;
            contextFields.Add(alias);
            aliases.Add(alias);
        }
    }

    private static string? FindWhitespaceAlias(string text)
    {
        var depth = 0;
        for (var index = text.Length - 1; index >= 0; index--)
        {
            switch (text[index])
            {
                case ')': depth++; break;
                case '(': depth--; break;
                case ']' : depth++; break;
                case '[': depth--; break;
                case '>' : depth++; break;
                case '<': depth--; break;
                case ' ' when depth == 0:
                    var alias = text[(index + 1)..].Trim();
                    if (Regex.IsMatch(alias, @"^[A-Za-z_][A-Za-z0-9_]*$"))
                        return alias;
                    break;
            }
        }
        return null;
    }

    private static bool IsClauseLine(string line)
        => Regex.IsMatch(
            line,
            @"^(where|order|skip|take|on|left\s+join|inner\s+join|right\s+join|full\s+join)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static void Add(List<Candidate> candidates, string label, string detail, string kind, int relevance, string? insertText = null)
        => candidates.Add(new Candidate(label, insertText ?? label, detail, kind, relevance, relevance));

    private static double Score(Candidate candidate, string query)
    {
        if (string.IsNullOrEmpty(query)) return candidate.SortOrder * 1000 + candidate.Relevance;
        var label = candidate.Label.ToLowerInvariant();
        var normalized = query.ToLowerInvariant();
        var index = label.IndexOf(normalized, StringComparison.Ordinal);
        if (index < 0) return double.PositiveInfinity;
        return candidate.SortOrder * 1000 + (index == 0 ? 0 : 100) + index + candidate.Relevance;
    }

    private sealed record Candidate(string Label, string InsertText, string Detail, string Kind, int Relevance, int SortOrder)
    {
        public double Score { get; init; }
    }

    private sealed record FieldCandidate(string Label, string Detail, string Kind);
    private sealed record ReplacementToken(int Start, int End, string Query);
    private sealed record DynamicNames(
        IReadOnlySet<string> Contexts,
        IReadOnlySet<string> Aliases,
        IReadOnlySet<string> Entities,
        IReadOnlyDictionary<string, string> Sources,
        IReadOnlyDictionary<string, HashSet<string>> ContextFields);

    private enum CompletionContext
    {
        Document,
        Header,
        Projection,
        Where,
        Order,
        Join,
        On,
        Value,
        Clause,
    }
}
