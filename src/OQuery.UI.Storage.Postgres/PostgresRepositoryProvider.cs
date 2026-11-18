using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Repositories;

namespace OQuery.UI.Storage.Postgres;

/// <summary>
/// Postgres provider. Stores user-defined domains and queries only. Built-in data is held in memory,
/// as in the File provider. Function definitions are not stored in Postgres.
/// </summary>
public sealed class PostgresRepositoryProvider : IRepositoryProvider
{
    public PostgresRepositoryProvider(
        string connectionString,
        IReadOnlyCollection<DomainDto> builtinDomains,
        IReadOnlyCollection<QueryRequestRecordDto> builtinQueries)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        Domains = new PostgresDomainRepository(
            new PostgresDocumentStore(connectionString, PostgresDomainRepository.TABLE), builtinDomains);
        Queries = new PostgresQueryRequestRepository(
            new PostgresDocumentStore(connectionString, PostgresQueryRequestRepository.TABLE), builtinQueries);
    }

    public IDomainRepository Domains { get; }
    public IQueryRequestRepository Queries { get; }
    public IFunctionDefinitionRepository Functions { get; } = new NoFunctionDefinitionRepository();
}

/// <summary>Function definitions are not persisted by the Postgres provider; reads are empty and writes are rejected.</summary>
internal sealed class NoFunctionDefinitionRepository : IFunctionDefinitionRepository
{
    private const string MESSAGE = "The Postgres repository provider does not store custom function definitions. Use the file repository provider.";

    public IReadOnlyCollection<FunctionDefinitionDto> GetAll(string userSectionId) => [];

    public FunctionDefinitionDto? Get(string userSectionId, string id) => null;

    public void Save(string userSectionId, FunctionDefinitionDto item) => throw new NotSupportedException(MESSAGE);

    public bool Delete(string userSectionId, string id) => throw new NotSupportedException(MESSAGE);
}
