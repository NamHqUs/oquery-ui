using OQuery;

namespace Demo.Contracts.Repositories;

public interface IMetadataRepository : IRepository<Entity>
{
    void Reset(string userSectionId);
}
