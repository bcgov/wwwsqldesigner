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
            var list = await ApplyOwnerFilter(_context.DataModels.AsNoTracking())
                .OrderBy(x => x.Keyword)
                .OrderByDescending(x => x.Version)
                .Select(x => x.Keyword + " v" + x.Version + " - /?keyword=" + x.Keyword + "&version=" + x.Version)
                .ToListAsync();
            return Content(string.Join("\n", list));
        }

        [HttpGet]
        [Route("backend/netcore-ef/load")]
        public async Task<IActionResult> Load(string? keyword, int? version)
        {
            if (string.IsNullOrEmpty(keyword))
            {
                return NotFound();
            }

            IQueryable<DataModel> query = ApplyOwnerFilter(_context.DataModels);
            DataModel? model;
            if (!version.HasValue)
            {
                model = await query.OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync(x => x.Keyword == keyword);
            }
            else
            {
                model = await query.FirstOrDefaultAsync(x => x.Keyword == keyword && x.Version == version);
            }
            if (null == model)
            {
                _logger.LogWarning("Keyword not found: {keyword:0}", keyword);
                return NotFound();
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

            var ownerId = GetCurrentOwnerId();

            //Read XML data from request body
            Request.EnableBuffering();
            Request.Body.Position = 0;
            string xmlData;
            using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            {
                xmlData = await reader.ReadToEndAsync().ConfigureAwait(false);
            }
            var save = await ApplyOwnerFilter(_context.DataModels)
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

        private string GetCurrentOwnerId()
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return _keycloakSettings.LegacyOwnerId;
            }

            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")
                ?? User.FindFirstValue("preferred_username")
                ?? User.FindFirstValue(ClaimTypes.Upn)
                ?? User.Identity?.Name
                ?? _keycloakSettings.LegacyOwnerId;
        }

        private IQueryable<DataModel> ApplyOwnerFilter(IQueryable<DataModel> query)
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return query.Where(x => x.OwnerId == _keycloakSettings.LegacyOwnerId);
            }

            return query.Where(x => x.OwnerId == GetCurrentOwnerId());
        }
    }
}