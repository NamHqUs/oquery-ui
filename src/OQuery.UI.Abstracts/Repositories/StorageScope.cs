namespace OQuery.UI.Abstracts.Repositories;

/// <summary>Where a repository reads and writes: the user's section, and optionally one project inside it.</summary>
public sealed record StorageScope(string UserSectionId, string? ProjectId = null);
