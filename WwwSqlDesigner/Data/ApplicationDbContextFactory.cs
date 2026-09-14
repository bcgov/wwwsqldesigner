using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace WwwSqlDesigner.Data
{
    public sealed class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
    {
        public ApplicationDbContext CreateDbContext(string[] args)
        {
            var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
                ?? Environments.Development;
            var configurationBuilder = new ConfigurationBuilder()
                .SetBasePath(AppContext.BaseDirectory)
                .AddJsonFile("appsettings.json", optional: false)
                .AddJsonFile($"appsettings.{environment}.json", optional: true);
            if (string.Equals(environment, Environments.Development, StringComparison.OrdinalIgnoreCase))
            {
                configurationBuilder.AddUserSecrets<ApplicationDbContextFactory>(optional: true);
            }
            var configuration = configurationBuilder
                .AddEnvironmentVariables()
                .Build();
            var connectionString = configuration.GetConnectionString("DefaultConnection");

            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "The DefaultConnection connection string must be configured for Entity Framework design-time operations.");
            }

            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlServer(connectionString)
                .Options;

            return new ApplicationDbContext(options);
        }
    }
}
