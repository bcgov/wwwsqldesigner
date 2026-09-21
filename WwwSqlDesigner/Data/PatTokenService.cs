using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace WwwSqlDesigner.Data;

public static class PatScopes
{
    public const string ApplicationsRead = "applications:read";
    public const string ApplicationsCreate = "applications:create";
    public const string ApplicationsManage = "applications:manage";
    public const string ModelsRead = "models:read";
    public const string ModelsWrite = "models:write";
    public const string ModelsImport = "models:import";
    public const string ModelsExport = "models:export";
    public const string VocabulariesRead = "vocabularies:read";
}

public sealed record CreatedPat(PersonalAccessToken Token, string Plaintext);

public sealed class PatTokenService
{
    private const int MaxActiveTokens = 10;
    private readonly ApplicationDbContext _db;
    public PatTokenService(ApplicationDbContext db) => _db = db;

    public async Task<CreatedPat> CreateAsync(string owner, IEnumerable<string> scopes, TimeSpan lifetime, string? name, CancellationToken ct)
    {
        if (lifetime <= TimeSpan.Zero || lifetime > TimeSpan.FromDays(90))
            throw new ArgumentException("Token lifetime must be greater than zero and no more than 90 days.", nameof(lifetime));
        var requested = scopes.Distinct(StringComparer.Ordinal).ToArray();
        if (requested.Any(x => !typeof(PatScopes).GetFields().Any(f => string.Equals((string)f.GetValue(null)!, x, StringComparison.Ordinal))))
            throw new ArgumentException("Unknown scope.", nameof(scopes));
        if (await _db.PersonalAccessTokens.CountAsync(x => x.Owner == owner && x.RevokedAt == null && x.ExpiresAt > DateTime.UtcNow, ct) >= MaxActiveTokens)
            throw new InvalidOperationException("Maximum active token count reached.");
        var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var plaintext = "sqd_" + secret;
        var token = new PersonalAccessToken { Owner = owner, Name = string.IsNullOrWhiteSpace(name) ? null : name.Trim(), Prefix = plaintext[..12], TokenHash = Hash(plaintext), ScopesJson = JsonSerializer.Serialize(requested), ExpiresAt = DateTime.UtcNow.Add(lifetime) };
        _db.PersonalAccessTokens.Add(token);
        await _db.SaveChangesAsync(ct);
        return new CreatedPat(token, plaintext);
    }

    public async Task<(PersonalAccessToken Token, string[] Scopes)?> ValidateAsync(string plaintext, string requiredScope, CancellationToken ct)
    {
        var hash = Hash(plaintext);
        var token = await _db.PersonalAccessTokens.SingleOrDefaultAsync(x => x.TokenHash == hash, ct);
        if (token is null || token.RevokedAt is not null || token.ExpiresAt <= DateTime.UtcNow) return null;
        var scopes = JsonSerializer.Deserialize<string[]>(token.ScopesJson) ?? Array.Empty<string>();
        if (!scopes.Contains(requiredScope, StringComparer.Ordinal)) return null;
        token.LastUsedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return (token, scopes);
    }

    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
