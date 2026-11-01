namespace Demo.Repositories.InMemory;

//public sealed class MetadataMemoryRepository : IMetadataRepository
//{
//    private readonly Dictionary<string, Entity> _entities = new(StringComparer.OrdinalIgnoreCase);

//    public IReadOnlyList<Entity> GetAll() => _entities.Values.ToArray();

//    public void Save(Entity entity) => _entities[entity.Name] = entity;

//    public void Delete(string entityName) => _entities.Remove(entityName);
//}
