using OQuery.UI.Abstracts.Dto;
using OQuery.UI.Abstracts.Application;
using OQuery.UI.Abstracts.Repositories;
using OQuery.UI.Abstracts.Services;
using OQuery;

namespace OQuery.UI.Api.Services;

public sealed class MetadataService : IMetadataService
{
    private readonly IMetadataRepository _metadataRepository;
    private readonly IUserSectionManager _userSectionManager;

    public MetadataService(
        IMetadataRepository metadataRepository,
        IUserSectionManager userSectionManager)
    {
        _metadataRepository = metadataRepository;
        _userSectionManager = userSectionManager;
    }

    public IReadOnlyList<EntityDto> GetAll()
    {
        var sectionId = _userSectionManager.GetSectionId();
        return GetAllEntities(sectionId)
            .Select(EntityDto.FromEntity)
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
