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
        var userDefinedNames = _metadataRepository.GetUserDefined(sectionId)
            .Select(entity => entity.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return GetAllEntities(sectionId)
            .Select(entity => MetadataEntityDto.FromEntity(entity, userDefinedNames.Contains(entity.Name)))
            .ToArray();
    }

    public bool IsBuiltin(string entityName)
        => _metadataRepository.GetBuiltin().Any(entity =>
            string.Equals(entity.Name, entityName, StringComparison.OrdinalIgnoreCase));

    public Entity Create(Entity entity)
    {
        ValidateEntity(entity);
        var sectionId = _userSectionManager.GetSectionId();
        var metadata = GetAllEntities(sectionId);
        if (metadata.Any(item => string.Equals(item.Name, entity.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"An entity named '{entity.Name}' already exists.");

        _metadataRepository.Save(sectionId, entity);
        return entity;
    }

    public Entity Update(string entityName, Entity entity)
    {
        var sectionId = _userSectionManager.GetSectionId();
        if (IsBuiltin(entityName))
            throw new InvalidOperationException($"Built-in entity '{entityName}' is read-only.");

        ValidateEntity(entity);
        var userEntities = _metadataRepository.GetUserDefined(sectionId);
        if (!userEntities.Any(item => string.Equals(item.Name, entityName, StringComparison.OrdinalIgnoreCase)))
        {
            throw new KeyNotFoundException($"Entity '{entityName}' was not found.");
        }

        if (GetAllEntities(sectionId).Any(item =>
            !string.Equals(item.Name, entityName, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(item.Name, entity.Name, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"An entity named '{entity.Name}' already exists.");

        _metadataRepository.Save(sectionId, entity);
        if (!string.Equals(entityName, entity.Name, StringComparison.OrdinalIgnoreCase))
            _metadataRepository.Delete(sectionId, entityName);
        return entity;
    }

    public void Delete(string entityName)
    {
        var sectionId = _userSectionManager.GetSectionId();
        if (!_metadataRepository.GetUserDefined(sectionId)
            .Any(item => string.Equals(item.Name, entityName, StringComparison.OrdinalIgnoreCase)))
        {
            if (IsBuiltin(entityName))
                throw new InvalidOperationException($"Built-in entity '{entityName}' cannot be deleted.");
            return;
        }

        _metadataRepository.Delete(sectionId, entityName);
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

    private static void ValidateEntity(Entity entity)
    {
        if (entity is null || string.IsNullOrWhiteSpace(entity.Name))
            throw new ArgumentException("Entity name is required.");
        if (entity.Fields is null || entity.Fields.Count == 0)
            throw new ArgumentException("An entity must contain at least one field.");
        if (entity.Fields.Any(field => string.IsNullOrWhiteSpace(field.Name)))
            throw new ArgumentException("Every field must have a name.");
        if (entity.Fields.Select(field => field.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != entity.Fields.Count)
            throw new ArgumentException("Field names must be unique within an entity.");
    }
}
