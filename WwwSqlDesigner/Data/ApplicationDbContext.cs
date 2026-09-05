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

            modelBuilder.Entity<DataModel>(entity =>
            {
                entity.HasKey(e => e.Id).IsClustered();
                entity.Property(e => e.OwnerId).UseCollation("Latin1_General_100_BIN2");
                entity.Property<int?>("OwnerIdByteLength")
                    .HasComputedColumnSql("DATALENGTH([OwnerId])", stored: true);
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("getdate()");
                entity.HasIndex(
                        nameof(DataModel.OwnerId),
                        nameof(DataModel.Keyword),
                        nameof(DataModel.Version),
                        "OwnerIdByteLength")
                    .IsUnique()
                    .HasFilter(null)
                    .IsClustered(false);
            });

            modelBuilder.Entity<DataModelAccessGrant>(entity =>
            {
                entity.HasKey(e => e.Id).IsClustered();
                entity.Property(e => e.OwnerId).UseCollation("Latin1_General_100_BIN2");
                entity.Property(e => e.TargetId).UseCollation("Latin1_General_100_BIN2");
                entity.Property<int>("OwnerIdByteLength")
                    .HasComputedColumnSql("DATALENGTH([OwnerId])", stored: true);
                entity.Property<int>("TargetIdByteLength")
                    .HasComputedColumnSql("DATALENGTH([TargetId])", stored: true);
                entity.Property(e => e.Permission).HasDefaultValue("View");
                entity.HasIndex(
                        nameof(DataModelAccessGrant.OwnerId),
                        nameof(DataModelAccessGrant.Keyword),
                        nameof(DataModelAccessGrant.TargetType),
                        nameof(DataModelAccessGrant.TargetId),
                        "OwnerIdByteLength",
                        "TargetIdByteLength")
                    .IsUnique()
                    .IsClustered(false);
                entity.HasIndex(
                    nameof(DataModelAccessGrant.TargetType),
                    nameof(DataModelAccessGrant.TargetId),
                    nameof(DataModelAccessGrant.Permission),
                    "TargetIdByteLength");
            });
        }
    }
}