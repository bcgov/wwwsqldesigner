using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WwwSqlDesigner.Data;
using WwwSqlDesigner.Services;

namespace WwwSqlDesigner.Controllers;

[ApiController]
[Route("api/ui/v1")]
public sealed class CookieApiV1Controller : DataArchitectureControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly PatTokenService _tokens;

    protected override string ApiBasePath => "/api/ui/v1";

    public CookieApiV1Controller(
        ApplicationDbContext db,
        PatTokenService tokens,
        SchemaExportService exports)
        : base(db, exports)
    {
        _db = db;
        _tokens = tokens;
    }

    [HttpPost("tokens")]
    public async Task<IActionResult> CreateToken(CreateTokenRequest request, CancellationToken ct)
    {
        var owner = User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(owner)) return Unauthorized();
        try
        {
            var created = await _tokens.CreateAsync(owner, request.Scopes, request.ExpiresIn, request.Name, ct);
            return Ok(new
            {
                id = created.Token.Id,
                token = created.Plaintext,
                prefix = created.Token.Prefix,
                name = created.Token.Name,
                expiresAt = created.Token.ExpiresAt,
                scopes = request.Scopes
            });
        }
        catch (ArgumentException exception)
        {
            return BadRequest(new { error = exception.Message });
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(new { error = exception.Message });
        }
    }

    [HttpGet("tokens")]
    public async Task<IActionResult> ListTokens(CancellationToken ct)
    {
        var owner = User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(owner)) return Unauthorized();
        return Ok(await _db.PersonalAccessTokens.AsNoTracking()
            .Where(token => token.Owner == owner)
            .OrderByDescending(token => token.CreatedAt)
            .Select(token => new
            {
                token.Id,
                token.Name,
                token.Prefix,
                token.ExpiresAt,
                token.RevokedAt,
                token.LastUsedAt,
                token.CreatedAt,
                token.ScopesJson
            })
            .ToListAsync(ct));
    }

    [HttpPost("tokens/{id:guid}/revoke")]
    public async Task<IActionResult> RevokeToken(Guid id, CancellationToken ct)
    {
        var owner = User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(owner)) return Unauthorized();
        var token = await _db.PersonalAccessTokens.SingleOrDefaultAsync(
            candidate => candidate.Id == id && candidate.Owner == owner,
            ct);
        if (token is null) return NotFound();
        token.RevokedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    protected override Task<(string Owner, PersonalAccessToken Token)?> Authorize(
        string scope,
        CancellationToken ct)
    {
        var owner = User.Identity?.Name;
        (string Owner, PersonalAccessToken Token)? result = string.IsNullOrWhiteSpace(owner)
            ? null
            : (owner, new PersonalAccessToken
            {
                Owner = owner,
                ScopesJson = JsonSerializer.Serialize(new[] { scope })
            });
        return Task.FromResult(result);
    }

    protected override IActionResult UnauthorizedOrForbidden() => Unauthorized();
}
