using Demo.Contracts.Dto;

namespace Demo.Contracts.Repositories;

public interface IQueryRequestRepository : IRepository<QueryDto>
{
    string CreateId(string userSectionId);
}
