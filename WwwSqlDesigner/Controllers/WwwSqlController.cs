using Microsoft.AspNetCore.Mvc;
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
        [HttpPost]
        [Route("backend/netcore-ef")]
        public async Task<IActionResult> Index(string? keyword)
        {
            string action = Request.Query["action"].ToString().ToLower();
            switch (action)
            {
                case "list":
                    var list = _context.DataModels.OrderByDescending(x => x.CreatedAt).Select(x => x.Keyword).ToList();
                    return Content(string.Join("\n", list));
                case "load":
                    if (string.IsNullOrEmpty(keyword))
                    {
                        return NotFound();
                    }
                    var load = _context.DataModels.OrderByDescending(x => x.CreatedAt).FirstOrDefault(x => x.Keyword == keyword);
                    if (null == load)
                    {
                        _logger.LogWarning("Keyword not found: {keyword:0}", keyword);
                        return NotFound(keyword);
                    }
                    return Content(load.Data, "text/xml");
                case "save":
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
                case "import":
                default:
                    return NotFound();
            }
        }
    }
}