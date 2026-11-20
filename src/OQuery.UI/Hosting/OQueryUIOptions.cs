namespace OQuery.UI.Hosting;

/// <summary>
/// Settings for serving the embedded frontend from <c>UseOQueryUI</c>.
/// </summary>
public sealed class OQueryUIOptions
{
    /// <summary>URL path where the frontend is served. Must start with '/' and must not end with '/'.</summary>
    public string BasePath { get; set; } = "/oquery";
}
