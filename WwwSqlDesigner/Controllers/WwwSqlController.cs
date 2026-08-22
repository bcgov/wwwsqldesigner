using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text;
using WwwSqlDesigner.Authentication;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Controllers
{
    [ServiceFilter(typeof(RequireKeycloakAuthenticationFilter))]
    public class WwwSqlController : Controller
    {
        private readonly ILogger<WwwSqlController> _logger;
        private readonly ApplicationDbContext _context;
        private readonly KeycloakSettings _keycloakSettings;
        private readonly IAntiforgery? _antiforgery;

        public WwwSqlController(ILogger<WwwSqlController> logger, ApplicationDbContext context, KeycloakSettings? keycloakSettings = null, IAntiforgery? antiforgery = null)
        {
            _logger = logger;
            _context = context;
            _keycloakSettings = keycloakSettings ?? new KeycloakSettings();
            _antiforgery = antiforgery;
        }

        [HttpGet]
        [Route("backend/netcore-ef/list")]
        public async Task<IActionResult> List()
        {
            Response.Headers["X-MODEL-CURRENT-OWNER-ID"] = GetEffectiveOwnerId();
            Response.Headers["X-MODEL-CURRENT-OWNER-LABEL"] = GetOwnerDisplayLabel();
            Response.Headers["X-MODEL-CURRENT-GROUPS"] = System.Text.Json.JsonSerializer.Serialize(GetCurrentGroupIds());
            var models = await ApplyOwnerFilter(_context.DataModels.AsNoTracking())
                .OrderByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.Version)
                .ToListAsync();
            var list = models.Select(x =>
                x.Keyword + " v" + x.Version
                + " - /?keyword=" + Uri.EscapeDataString(x.Keyword)
                + "&version=" + Uri.EscapeDataString(x.Version.ToString(System.Globalization.CultureInfo.InvariantCulture))
                + "&ownerId=" + Uri.EscapeDataString(x.OwnerId));
            return Content(string.Join("\n", list));
        }

        [HttpGet]
        [Route("backend/netcore-ef/load")]
        public async Task<IActionResult> Load(string? keyword, int? version, string? ownerId = null)
        {
            if (string.IsNullOrEmpty(keyword))
            {
                return NotFound();
            }

            var currentOwnerId = GetEffectiveOwnerId();
            IQueryable<DataModel> query = ApplyOwnerFilter(_context.DataModels)
                .Where(x => string.IsNullOrWhiteSpace(ownerId) || x.OwnerId == ownerId!.Trim());
            DataModel? model;
            if (!version.HasValue)
            {
                model = await query.OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync(x => x.Keyword == keyword);
            }
            else
            {
                model = await query
                    .Where(x => x.Keyword == keyword && x.Version == version)
                    .OrderByDescending(x => x.CreatedAt)
                    .FirstOrDefaultAsync();
            }
            if (null == model)
            {
                _logger.LogWarning("Keyword not found: {keyword:0}", keyword);
                return NotFound();
            }
            var ownsModel = string.Equals(model.OwnerId, currentOwnerId, StringComparison.Ordinal);
            if (!ownsModel)
            {
                Response.Headers["X-MODEL-COPYABLE"] = "true";
            }
            return Content(model.Data, "text/xml");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Route("backend/netcore-ef/save")]
        public async Task<IActionResult> Save(string? keyword)
        {
            if (string.IsNullOrEmpty(keyword))
            {
                return NotFound();
            }

            var ownerId = GetEffectiveOwnerId();

            //Read XML data from request body
            Request.EnableBuffering();
            Request.Body.Position = 0;
            string xmlData;
            using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            {
                xmlData = await reader.ReadToEndAsync().ConfigureAwait(false);
            }
            var save = await ApplyOwnerFilter(_context.DataModels, includeGrants: false)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(x => x.Keyword == keyword);
            if (null == save)
            {
                var newModel = new DataModel()
                {
                    Keyword = keyword,
                    Data = xmlData,
                    OwnerId = ownerId,
                    CreatedAt = DateTime.Now,
                    Version = 0,
                };
                _context.DataModels.Add(newModel);
                _logger.LogInformation("New data model created: {keyword:0}", keyword);
            }
            else
            {
                var newModel = new DataModel()
                {
                    Keyword = keyword,
                    Data = xmlData,
                    OwnerId = ownerId,
                    CreatedAt = DateTime.Now,
                    Version = save.Version + 1,  //This does not need to be thread-safe as a unique (key/version) key exists in the DB.
                };
                _context.DataModels.Add(newModel);
                _logger.LogInformation("New Data model version: {keyword:0}", keyword);
            }
            _context.SaveChanges();
            return Content(string.Empty);
        }

        [HttpGet]
        [Route("backend/netcore-ef/csrf")]
        public IActionResult CsrfToken()
        {
            if (_antiforgery is null)
            {
                return NoContent();
            }

            var tokens = _antiforgery.GetAndStoreTokens(HttpContext);
            return Content(tokens.RequestToken ?? string.Empty);
        }

        [HttpGet]
        [Route("backend/netcore-ef/import")]
        public IActionResult Import()
        {
            return NotFound();
        }

        [HttpGet]
        [Route("backend/netcore-ef/access")]
        public async Task<IActionResult> Access(string? keyword)
        {
            if (string.IsNullOrEmpty(keyword))
            {
                return NotFound();
            }

            var ownerId = GetEffectiveOwnerId();
            var ownsModel = await _context.DataModels.AnyAsync(x => x.OwnerId == ownerId && x.Keyword == keyword);
            if (!ownsModel)
            {
                return NotFound();
            }

            var grants = await _context.DataModelAccessGrants
                .AsNoTracking()
                .Where(x => x.OwnerId == ownerId && x.Keyword == keyword)
                .OrderBy(x => x.TargetType)
                .ThenBy(x => x.TargetId)
                .Select(x => new AccessGrantResponse(x.TargetType, x.TargetId, x.Permission))
                .ToListAsync();
            return new JsonResult(grants);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Route("backend/netcore-ef/access/grant")]
        public async Task<IActionResult> GrantAccess(string? keyword, [FromBody] AccessGrantRequest? request)
        {
            if (string.IsNullOrWhiteSpace(keyword) || request is null)
            {
                return BadRequest();
            }

            var ownerId = GetEffectiveOwnerId();
            var ownsModel = await _context.DataModels.AnyAsync(x => x.OwnerId == ownerId && x.Keyword == keyword);
            if (!ownsModel)
            {
                return NotFound();
            }

            var targetType = request.TargetType?.Trim();
            var targetId = request.TargetId?.Trim();
            var permission = request.Permission?.Trim();
            if (!IsValidTargetType(targetType) || string.IsNullOrWhiteSpace(targetId) || targetId.Length > 256
                || !IsValidPermission(permission))
            {
                return BadRequest("TargetType, TargetId, and Permission are invalid.");
            }

            var exists = await _context.DataModelAccessGrants.AnyAsync(x =>
                x.OwnerId == ownerId
                && x.Keyword == keyword
                && x.TargetType == targetType
                && x.TargetId == targetId);
            if (exists)
            {
                return Conflict();
            }

            _context.DataModelAccessGrants.Add(new DataModelAccessGrant
            {
                OwnerId = ownerId,
                Keyword = keyword,
                TargetType = targetType!,
                TargetId = targetId!,
                Permission = permission!
            });
            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete]
        [ValidateAntiForgeryToken]
        [Route("backend/netcore-ef/access/grant")]
        public async Task<IActionResult> RevokeAccess(string? keyword, string? targetType, string? targetId)
        {
            if (string.IsNullOrWhiteSpace(keyword) || !IsValidTargetType(targetType) || string.IsNullOrWhiteSpace(targetId))
            {
                return BadRequest();
            }

            var ownerId = GetEffectiveOwnerId();
            var grant = await _context.DataModelAccessGrants.FirstOrDefaultAsync(x =>
                x.OwnerId == ownerId
                && x.Keyword == keyword
                && x.TargetType == targetType
                && x.TargetId == targetId);
            if (grant is null)
            {
                return NotFound();
            }

            _context.DataModelAccessGrants.Remove(grant);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private string GetEffectiveOwnerId()
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return DataModel.UnownedOwnerId;
            }

            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")
                ?? User.FindFirstValue("preferred_username")
                ?? User.FindFirstValue(ClaimTypes.Upn)
                ?? User.Identity?.Name
                ?? throw new InvalidOperationException("The authenticated user has no stable owner identifier claim.");
        }

        private string GetOwnerDisplayLabel()
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return "Public models";
            }

            var name = User.FindFirstValue("name")
                ?? User.FindFirstValue(ClaimTypes.Name);
            var email = User.FindFirstValue(ClaimTypes.Email)
                ?? User.FindFirstValue("email");
            var username = User.FindFirstValue("preferred_username");
            if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(email))
            {
                return $"{name} ({email})";
            }
            return name ?? email ?? username ?? GetEffectiveOwnerId();
        }

        private IQueryable<DataModel> ApplyOwnerFilter(IQueryable<DataModel> query, bool includeGrants = true)
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return query.Where(x => x.OwnerId == DataModel.UnownedOwnerId);
            }

            var ownerId = GetEffectiveOwnerId();
            if (!includeGrants)
            {
                return query.Where(x => x.OwnerId == ownerId);
            }

            var groupIds = GetCurrentGroupIds();
            return query.Where(x =>
                x.OwnerId == ownerId
                || x.OwnerId == DataModel.UnownedOwnerId
                || _context.DataModelAccessGrants.Any(grant =>
                    grant.OwnerId == x.OwnerId
                    && grant.Keyword == x.Keyword
                    && grant.Permission == "View"
                    && ((grant.TargetType == "User" && grant.TargetId == ownerId)
                        || (grant.TargetType == "Group" && groupIds.Contains(grant.TargetId)))));
        }

        private string[] GetCurrentGroupIds()
        {
            return User.Claims
                .Where(x => x.Type == "groups" || x.Type == "group")
                .Select(x => x.Value)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }

        private static bool IsValidTargetType(string? targetType)
        {
            return string.Equals(targetType, "User", StringComparison.Ordinal)
                || string.Equals(targetType, "Group", StringComparison.Ordinal);
        }

        private static bool IsValidPermission(string? permission)
        {
            return string.Equals(permission, "View", StringComparison.Ordinal);
        }

    }

    public sealed record AccessGrantRequest(string? TargetType, string? TargetId, string? Permission);
    public sealed record AccessGrantResponse(string TargetType, string TargetId, string Permission);
}