using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Controllers
{
    public class WwwSqlController : Controller
    {
        private readonly ILogger<WwwSqlController> _logger;
        private readonly ApplicationDbContext _context;

        public WwwSqlController(ILogger<WwwSqlController> logger, ApplicationDbContext context)
        {
            _logger = logger;
            _context = context;
        }

        [HttpGet]
        [Route("backend/netcore-ef/list")]
        public async Task<IActionResult> List()
        {
            var list = await _context.DataModels.OrderByDescending(x => x.CreatedAt).Select(x => x.Keyword).ToListAsync();
            return Content(string.Join("\n", list));
        }

        [HttpGet]
        [Route("backend/netcore-ef/load")]
        public async Task<IActionResult> Load(string? keyword)
        {
            if (string.IsNullOrEmpty(keyword))
            {
                return NotFound();
            }
            var load = await _context.DataModels.OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync(x => x.Keyword == keyword);
            if (null == load)
            {
                _logger.LogWarning("Keyword not found: {keyword:0}", keyword);
                return NotFound();
            }
            return Content(load.Data, "text/xml");
        }

        [HttpPost]
        [Route("backend/netcore-ef/save")]
        public async Task<IActionResult> Save(string? keyword)
        {
            if (string.IsNullOrEmpty(keyword))
            {
                return NotFound();
            }
            //Read XML data from request body
            Request.EnableBuffering();
            Request.Body.Position = 0;
            string xmlData;
            using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
            {
                xmlData = await reader.ReadToEndAsync().ConfigureAwait(false);
            }
            var save = _context.DataModels.OrderByDescending(x => x.CreatedAt).FirstOrDefault(x => x.Keyword == keyword);
            if (null == save)
            {
                var newModel = new DataModel()
                {
                    Keyword = keyword,
                    Data = xmlData,
                    CreatedAt = DateTime.Now,
                };
                _context.DataModels.Add(newModel);
                _logger.LogInformation("New data model created: {keyword:0}", keyword);
            }
            else
            {
                save.Data = xmlData;
                save.CreatedAt = DateTime.Now;
                _logger.LogInformation("Data model updated: {keyword:0}", keyword);
            }
            _context.SaveChanges();
            return Content(string.Empty);
        }

        [HttpGet]
        [Route("backend/netcore-ef/import")]
        public IActionResult Import()
        {
            return NotFound();
        }
    }
}