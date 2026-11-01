using Demo.Contracts.Dto;

namespace Demo.Contracts.Repositories;

public interface IReportRepository : IRepository<ReportDto>
{
    string CreateId(string userSectionId);
}
