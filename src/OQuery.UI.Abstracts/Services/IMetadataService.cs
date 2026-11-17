using OQuery.UI.Abstracts.Dto;
using OQuery;

namespace OQuery.UI.Abstracts.Services;

public interface IMetadataService
{
    IReadOnlyList<EntityDto> GetAll();
    IReadOnlyList<Entity> Reset();
    IMetadataProvider GetMetaProvider();
    IFunctionProvider GetFunctionProvider(ISqlDialect dialect);
}
