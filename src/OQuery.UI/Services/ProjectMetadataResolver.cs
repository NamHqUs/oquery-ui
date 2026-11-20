using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Services;

/// <summary>
/// Builds the metadata a query runs against: the listed entities of a FullDomain, with the sub-domain's name overrides applied.
/// Physical columns, raw SQL and relation key columns always come from the FullDomain.
/// </summary>
public static class ProjectMetadataResolver
{
    public static IReadOnlyList<OQuery.Entity> Resolve(FullDomainDto fullDomain, DomainDto domain)
    {
        ArgumentNullException.ThrowIfNull(fullDomain);
        ArgumentNullException.ThrowIfNull(domain);

        var full = fullDomain.Entities.ToDictionary(entity => entity.Name, StringComparer.OrdinalIgnoreCase);
        var exposedNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var entityNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in domain.Entities)
        {
            if (!full.ContainsKey(item.Entity))
                throw new ArgumentException($"Entity '{item.Entity}' does not exist in the full domain.", nameof(domain));
            var name = string.IsNullOrWhiteSpace(item.EntityName) ? item.Entity : item.EntityName.Trim();
            if (!exposedNames.TryAdd(item.Entity, name) || !entityNames.Add(name))
                throw new ArgumentException($"Entity '{item.Entity}' is listed more than once or renamed to a duplicate name.", nameof(domain));
        }

        var built = new Dictionary<string, OQuery.Entity>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in domain.Entities)
        {
            var source = full[item.Entity];
            var excluded = ToSet(item.ExcludedFields, item.Entity, "excluded field");
            var fieldRenames = ToRenames(item.FieldNames.Select(rename => (rename.Field, rename.FieldName)), item.Entity, "field");
            foreach (var field in fieldRenames.Keys.Concat(excluded))
                if (source.Fields.All(existing => !existing.Name.Equals(field, StringComparison.OrdinalIgnoreCase)))
                    throw new ArgumentException($"Field '{field}' does not exist on entity '{item.Entity}'.", nameof(domain));
            if (fieldRenames.Keys.Any(excluded.Contains))
                throw new ArgumentException($"Entity '{item.Entity}' renames a field it also excludes.", nameof(domain));

            var fields = source.Fields
                .Where(field => !excluded.Contains(field.Name))
                .Select(field => field with
                {
                    Name = fieldRenames.TryGetValue(field.Name, out var renamed) ? renamed : field.Name,
                })
                .ToList();
            if (fields.Select(field => field.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != fields.Count)
                throw new ArgumentException($"Entity '{item.Entity}' has duplicate field names after renaming.", nameof(domain));

            built[item.Entity] = new OQuery.Entity(
                exposedNames[item.Entity],
                fields,
                source.DbSchema,
                source.DbTable ?? source.RawSql,
                [],
                source.IsRawSql);
        }

        var relationRenames = domain.Entities.ToDictionary(
            item => item.Entity,
            item => ToRenames(item.RelationNames.Select(rename => (rename.Relation, rename.RelationName)), item.Entity, "relation"),
            StringComparer.OrdinalIgnoreCase);
        ValidateRelationRenames(fullDomain, relationRenames);

        foreach (var relation in fullDomain.Relations)
        {
            if (!exposedNames.ContainsKey(relation.SourceEntity) || !exposedNames.ContainsKey(relation.TargetEntity))
                continue;

            var sourceRelationName = Renamed(relationRenames[relation.SourceEntity], relation.SourceRelationName);
            var targetRelationName = Renamed(relationRenames[relation.TargetEntity], relation.TargetRelationName);
            var lookupKeys = relation.SourceFields.Zip(relation.TargetFields, (source, target) => new RelationItem(source, target)).ToList();
            var collectionKeys = relation.TargetFields.Zip(relation.SourceFields, (target, source) => new RelationItem(target, source)).ToList();

            built[relation.SourceEntity].Relations!.Add(new Relation(
                sourceRelationName,
                exposedNames[relation.TargetEntity],
                RelationType.Lookup,
                lookupKeys));
            built[relation.TargetEntity].Relations!.Add(new Relation(
                targetRelationName,
                exposedNames[relation.SourceEntity],
                RelationType.Collection,
                collectionKeys));
        }

        foreach (var entity in built.Values)
            if (entity.Relations!.Select(relation => relation.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != entity.Relations.Count)
                throw new ArgumentException($"Entity '{entity.Name}' has duplicate relation names after renaming.", nameof(domain));

        return domain.Entities.Select(item => built[item.Entity]).ToArray();
    }

    private static HashSet<string> ToSet(IEnumerable<string> values, string entity, string kind)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in values)
            if (!set.Add(value))
                throw new ArgumentException($"Entity '{entity}' lists {kind} '{value}' more than once.");
        return set;
    }

    private static Dictionary<string, string> ToRenames(IEnumerable<(string From, string To)> renames, string entity, string kind)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (from, to) in renames)
        {
            if (string.IsNullOrWhiteSpace(to))
                throw new ArgumentException($"Entity '{entity}' renames {kind} '{from}' to an empty name.");
            if (!map.TryAdd(from, to.Trim()))
                throw new ArgumentException($"Entity '{entity}' renames {kind} '{from}' more than once.");
        }
        return map;
    }

    private static void ValidateRelationRenames(
        FullDomainDto fullDomain,
        IReadOnlyDictionary<string, Dictionary<string, string>> relationRenames)
    {
        var ownedRelations = new HashSet<(string Entity, string Relation)>(EqualityComparer<(string, string)>.Default);
        foreach (var relation in fullDomain.Relations)
        {
            ownedRelations.Add((relation.SourceEntity.ToUpperInvariant(), relation.SourceRelationName.ToUpperInvariant()));
            ownedRelations.Add((relation.TargetEntity.ToUpperInvariant(), relation.TargetRelationName.ToUpperInvariant()));
        }

        foreach (var (entity, renames) in relationRenames)
            foreach (var relationName in renames.Keys)
                if (!ownedRelations.Contains((entity.ToUpperInvariant(), relationName.ToUpperInvariant())))
                    throw new ArgumentException($"Relation '{relationName}' does not exist on entity '{entity}'.");
    }

    private static string Renamed(Dictionary<string, string> renames, string original)
        => renames.TryGetValue(original, out var renamed) ? renamed : original;
}
