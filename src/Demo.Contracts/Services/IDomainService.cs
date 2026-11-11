using Demo.Contracts.Dto;
using OQuery;

namespace Demo.Contracts.Services;

public interface IDomainService
{
    IReadOnlyList<DomainNameDto> GetAllDomainNames();
    IReadOnlyList<DomainNameWithDescriptionDto> GetAllDomainNameWithDescriptions();
    DomainDto GetById(string domainId);
    DomainDto Create(DomainDto domain);
    DomainDto Generate(DomainGenerationRequestDto request);
    DomainDto Update(string domainId, DomainDto domain);
    void Delete(string domainId);
}
