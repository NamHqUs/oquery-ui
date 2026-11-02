using Demo.Contracts.Dto;
using OQuery;
using OQuery;

namespace Demo.Contracts.Services;

public interface IMetadataService
{
    IReadOnlyList<MetadataEntityDto> GetAll();
    bool IsBuiltin(string entityName);
    Entity Create(Entity entity);
    Entity Update(string entityName, Entity entity);
    void Delete(string entityName);
    IReadOnlyList<Entity> Reset();
    IMetadataProvider GetMetaProvider();
    IFunctionProvider GetFunctionProvider(ISqlDialect dialect);
}
