using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Controllers.Tests
{
    public class TestBase
    {
        #region Initialization
        private readonly DbContextOptions<ApplicationDbContext> _contextOptions;
        protected readonly ApplicationDbContext _dbContext;

        protected TestBase()
        {
            _contextOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase("WwwSqlDesignerTests")
                .ConfigureWarnings(b => b.Ignore(InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            _dbContext = new ApplicationDbContext(_contextOptions);
            _dbContext.Database.EnsureDeleted();
            _dbContext.Database.EnsureCreated();
        }
        #endregion

        #region Common Methods
        protected static ILogger<T> InitializeLogger<T>()
        {
            var serviceProvider = new ServiceCollection().AddLogging(builder => builder.AddDebug()).BuildServiceProvider();
            var factory = serviceProvider.GetService<ILoggerFactory>();
            return factory!.CreateLogger<T>();
        }
        #endregion
    }
}
