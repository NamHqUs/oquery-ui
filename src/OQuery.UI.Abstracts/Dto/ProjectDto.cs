using System;
using System.Collections.Generic;

namespace OQuery.UI.Abstracts.Dto;

/// <summary>
/// A project aggregate: its domains, each mapped to database tables.
/// Queries and custom functions are stored in the project folder and served by their own endpoints.
/// </summary>
public class ProjectDto
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    /// <summary>Name only. The consumer resolves it to a real connection.</summary>
    public string DbConnectionProfile { get; set; } = string.Empty;
    /// <summary>The DBMS of the project's connection. The connection string itself is never returned.</summary>
    public string DbProvider { get; set; } = string.Empty;
    public List<DomainDto> Domains { get; set; } = new();
}

/// <summary>The content of <c>project.json</c>.</summary>
public sealed record ProjectFileDto(string Id, string Name, string Description, string DbConnectionProfile)
{
    /// <summary>Set for projects created from a database. The connection string is stored encrypted.</summary>
    public ProjectConnectionDto? Connection { get; init; }
}

/// <summary>The DBMS and the AES-GCM encrypted connection string of a project.</summary>
public sealed record ProjectConnectionDto(string Provider, string EncryptedConnectionString);

/// <summary>Request to create a project whose Main domain is read from the database.</summary>
public sealed record ProjectFromDatabaseRequestDto(string Name, string Description, string Provider, string ConnectionString);
