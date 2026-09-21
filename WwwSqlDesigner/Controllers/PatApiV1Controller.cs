using Microsoft.AspNetCore.Mvc;
using WwwSqlDesigner.Data;
using WwwSqlDesigner.Services;

namespace WwwSqlDesigner.Controllers;

[ApiController]
[Route("api/v1")]
// Bearer PATs are caller-supplied credentials; this controller never authorizes ambient cookies.
[IgnoreAntiforgeryToken]
public sealed class PatApiV1Controller : DataArchitectureControllerBase
{
    private readonly PatTokenService _tokens;

    protected override string ApiBasePath => "/api/v1";

    public PatApiV1Controller(
        ApplicationDbContext db,
        PatTokenService tokens,
        SchemaExportService exports)
        : base(db, exports) =>
        _tokens = tokens;

    protected override async Task<(string Owner, PersonalAccessToken Token)?> Authorize(
        string scope,
        CancellationToken ct)
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var result = await _tokens.ValidateAsync(header[7..].Trim(), scope, ct);
        return result is null ? null : (result.Value.Token.Owner, result.Value.Token);
    }

    protected override IActionResult UnauthorizedOrForbidden() =>
        Request.Headers.Authorization.Count == 0 ? Unauthorized() : Forbid();
}
