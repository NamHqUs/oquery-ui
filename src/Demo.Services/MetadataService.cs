using Demo.Contracts.Dto;
using Demo.Contracts.Application;
using Demo.Contracts.Repositories;
using Demo.Contracts.Services;
using OQuery;

namespace Demo.Services;

public sealed class MetadataService : IMetadataService
{
    private readonly IMetadataRepository _metadataRepository;
    private readonly IFunctionDefinitionService _functionDefinitionService;
    private readonly IUserSectionManager _userSectionManager;

    public MetadataService(
        IMetadataRepository metadataRepository,
        IFunctionDefinitionService functionDefinitionService,
        IUserSectionManager userSectionManager)
    {
        _metadataRepository = metadataRepository;
        _functionDefinitionService = functionDefinitionService;
        _userSectionManager = userSectionManager;
    }

    public IReadOnlyList<MetadataEntityDto> GetAll()
    {
        var sectionId = _userSectionManager.GetSectionId();
        return GetAllEntities(sectionId)
            .Select(MetadataEntityDto.FromEntity)
            .ToArray();
    }

    public IReadOnlyList<Entity> Reset()
    {
        var sectionId = _userSectionManager.GetSectionId();
        _metadataRepository.Reset(sectionId);
        return GetAllEntities(sectionId);
    }

    public IMetadataProvider GetMetaProvider()
        => new MetadataProvider(GetAllEntities(_userSectionManager.GetSectionId()));

    public IFunctionProvider GetFunctionProvider(ISqlDialect dialect)
        => new FunctionProvider(
            dialect,
            _functionDefinitionService.GetAll().Select(definition => definition.ToFunctionDefinition()));

    private IReadOnlyList<Entity> GetAllEntities(string userSectionId)
    {
        var builtin = _metadataRepository.GetBuiltin();
        var userDefined = _metadataRepository.GetUserDefined(userSectionId);
        var names = builtin.Select(entity => entity.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var entity in userDefined)
        {
            if (!names.Add(entity.Name))
                throw new InvalidDataException($"User metadata cannot replace built-in entity '{entity.Name}'.");
        }
        return builtin.Concat(userDefined).ToArray();
    }

}
