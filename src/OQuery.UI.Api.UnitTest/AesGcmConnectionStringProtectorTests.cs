using Microsoft.Extensions.Options;
using NUnit.Framework;
using OQuery.UI.Hosting;
using OQuery.UI.Services;
using System.Security.Cryptography;

namespace OQuery.UI.Api.UnitTest;

[TestFixture]
internal sealed class AesGcmConnectionStringProtectorTests
{
    private const string ConnectionString = "Server=db;Password=Secret123!";

    [Test]
    public void ProtectedValueRoundTripsAndHidesThePlaintext()
    {
        var protector = Create("key-a");

        var first = protector.Protect(ConnectionString);
        var second = protector.Protect(ConnectionString);

        Assert.That(first, Does.Not.Contain("Secret123"));
        Assert.That(second, Is.Not.EqualTo(first), "Each value must get a fresh nonce.");
        Assert.That(protector.Unprotect(first), Is.EqualTo(ConnectionString));
    }

    [Test]
    public void ValueFailsToDecryptWithAnotherKeyOrWhenTampered()
    {
        var protected_ = Create("key-a").Protect(ConnectionString);
        var bytes = Convert.FromBase64String(protected_);
        bytes[^1] ^= 0x01;

        Assert.That(() => Create("key-b").Unprotect(protected_), Throws.InstanceOf<CryptographicException>());
        Assert.That(() => Create("key-a").Unprotect(Convert.ToBase64String(bytes)), Throws.InstanceOf<CryptographicException>());
    }

    private static AesGcmConnectionStringProtector Create(string secret)
        => new(Options.Create(new OQueryOptions
        {
            Security = new OQueryOptions.SecurityOptions { EncryptionKey = secret },
        }));
}
