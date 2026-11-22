using OQuery.UI.Abstracts.Dto;

namespace OQuery.UI.Services;

/// <summary>
/// Builds the metadata a query runs against: the entities and relations of one domain, as the engine expects them.
/// </summary>
public static class ProjectMetadataResolver
{
    public static IReadOnlyList<OQuery.Entity> Resolve(DomainDto domain)
    {
        ArgumentNullException.ThrowIfNull(domain);

        var built = new Dictionary<string, OQuery.Entity>(StringComparer.OrdinalIgnoreCase);
        foreach (var entity in domain.Entities)
        {
            var fields = entity.Fields.ToList();
            if (fields.Select(field => field.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != fields.Count)
                throw new ArgumentException($"Entity '{entity.Name}' has duplicate field names.", nameof(domain));
            if (!built.TryAdd(entity.Name, new OQuery.Entity(
                    entity.Name,
                    fields,
                    entity.DbSchema,
                    entity.DbTable ?? entity.RawSql,
                    [],
                    entity.IsRawSql)))
                throw new ArgumentException($"Entity '{entity.Name}' appears more than once.", nameof(domain));
        }

        foreach (var relation in domain.Relations)
        {
            if (!built.TryGetValue(relation.SourceEntity, out var source) || !built.TryGetValue(relation.TargetEntity, out var target))
                throw new ArgumentException($"Relation '{relation.SourceRelationName}' references an entity that is not in the domain.", nameof(domain));

            var lookupKeys = relation.SourceFields.Zip(relation.TargetFields, (sourceField, targetField) => new RelationItem(sourceField, targetField)).ToList();
            var collectionKeys = relation.TargetFields.Zip(relation.SourceFields, (targetField, sourceField) => new RelationItem(targetField, sourceField)).ToList();

            source.Relations!.Add(new Relation(relation.SourceRelationName, target.Name, RelationType.Lookup, lookupKeys));
            target.Relations!.Add(new Relation(relation.TargetRelationName, source.Name, RelationType.Collection, collectionKeys));
        }

        foreach (var entity in built.Values)
            if (entity.Relations!.Select(relation => relation.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != entity.Relations.Count)
                throw new ArgumentException($"Entity '{entity.Name}' has duplicate relation names.", nameof(domain));

        return domain.Entities.Select(entity => built[entity.Name]).ToArray();
    }
}

