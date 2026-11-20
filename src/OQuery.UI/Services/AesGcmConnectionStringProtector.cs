using OQuery.UI.Abstracts.Services;
using OQuery.UI.Hosting;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;

namespace OQuery.UI.Services;

/// <summary>
/// AES-256-GCM with the key derived from <see cref="OQueryOptions.SecurityOptions.SecretKey"/> by SHA-256.
/// The output is base64 of nonce (12 bytes), tag (16 bytes) and ciphertext, so each value gets a fresh nonce.
/// </summary>
public sealed class AesGcmConnectionStringProtector : IConnectionStringProtector
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly byte[] _key;

    public AesGcmConnectionStringProtector(IOptions<OQueryOptions> options)
    {
        var secret = options.Value.Security.SecretKey
            ?? throw new InvalidOperationException("OQuery:Security:SecretKey is required.");
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
    }

    public string Protect(string connectionString)
    {
        ArgumentException.ThrowIfNullOrEmpty(connectionString);
        var plaintext = Encoding.UTF8.GetBytes(connectionString);
        var nonce = RandomNumberGenerator.GetBytes(NonceSize);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];
        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        var payload = new byte[NonceSize + TagSize + ciphertext.Length];
        nonce.CopyTo(payload, 0);
        tag.CopyTo(payload, NonceSize);
        ciphertext.CopyTo(payload, NonceSize + TagSize);
        return Convert.ToBase64String(payload);
    }

    public string Unprotect(string protectedValue)
    {
        ArgumentException.ThrowIfNullOrEmpty(protectedValue);
        var payload = Convert.FromBase64String(protectedValue);
        if (payload.Length < NonceSize + TagSize)
            throw new CryptographicException("The protected value is too short.");

        var nonce = payload.AsSpan(0, NonceSize);
        var tag = payload.AsSpan(NonceSize, TagSize);
        var ciphertext = payload.AsSpan(NonceSize + TagSize);
        var plaintext = new byte[ciphertext.Length];
        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return Encoding.UTF8.GetString(plaintext);
    }
}
