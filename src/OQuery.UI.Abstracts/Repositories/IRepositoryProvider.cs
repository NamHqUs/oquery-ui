namespace OQuery.UI.Abstracts.Repositories;

public interface IRepositoryProvider
{
    IDomainRepository Domains { get; }

    IQueryRequestRepository Queries { get; }

    /// <summary>Custom function definitions only.</summary>
    IFunctionDefinitionRepository Functions { get; }
}
