using Microsoft.EntityFrameworkCore;

namespace WwwSqlDesigner.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext()
        {
        }

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public virtual DbSet<DataModel> DataModels { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.UseCollation("Latin1_General_CI_AS");

            modelBuilder.Entity<DataModel>(entity =>
            {
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("getdate()");
            });
        }
    }
}