using Demo.Contracts.Dto;
using OQuery;

namespace Demo.Contracts.Services;

public interface IMetadataService
{
    IReadOnlyList<MetadataEntityDto> GetAll();
    IReadOnlyList<Entity> Reset();
    IMetadataProvider GetMetaProvider();
    IFunctionProvider GetFunctionProvider(ISqlDialect dialect);
}
