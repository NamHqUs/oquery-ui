namespace OQuery.UI.Abstracts.Services;

/// <summary>Encrypts connection strings before they are written to disk and decrypts them when a project connects.</summary>
public interface IConnectionStringProtector
{
    string Protect(string connectionString);
    string Unprotect(string protectedValue);
}
