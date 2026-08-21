using Microsoft.EntityFrameworkCore;

namespace WwwSqlDesigner.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext() { }

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

        public virtual DbSet<DataModel> DataModels { get; set; } = null!;
        public virtual DbSet<DataModelAccessGrant> DataModelAccessGrants { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.UseCollation("Latin1_General_CI_AS");

            modelBuilder.Entity<DataModel>().HasKey(x => new { x.OwnerId, x.Keyword, x.Version });

            modelBuilder.Entity<DataModel>(entity =>
            {
                entity.Property(e => e.OwnerId).HasDefaultValue(DataModel.UnownedOwnerId);
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("getdate()");
            });

            modelBuilder.Entity<DataModelAccessGrant>(entity =>
            {
                entity.HasKey(x => new { x.OwnerId, x.Keyword, x.TargetType, x.TargetId });
                entity.Property(e => e.Permission).HasDefaultValue("View");
                entity.HasIndex(e => new { e.TargetType, e.TargetId, e.Permission });
            });
        }
    }
}