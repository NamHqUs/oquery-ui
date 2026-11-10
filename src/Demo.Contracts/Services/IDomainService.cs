using Demo.Contracts.Dto;
using OQuery;

namespace Demo.Contracts.Services;

public interface IDomainService
{
    IReadOnlyList<DomainDto> GetAll();
    IReadOnlyList<MetadataEntityDto> GetEntities(string? scopeName);
    DomainDto Create(DomainDto scope);
    DomainDto Generate(DomainGenerationRequestDto request);
    DomainDto Update(string scopeName, DomainDto scope);
    void Delete(string scopeName);
    IMetadataProvider GetMetadataProvider(string? scopeName);
}
