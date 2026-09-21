using Microsoft.EntityFrameworkCore;

namespace WwwSqlDesigner.Data
{
    public class ApplicationDbContext : DbContext
    {
        private const string OwnerIdByteLengthColumn = "OwnerIdByteLength";

        public ApplicationDbContext() { }

        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

        public virtual DbSet<DataModel> DataModels { get; set; } = null!;
        public virtual DbSet<DataModelAccessGrant> DataModelAccessGrants { get; set; } = null!;
        public virtual DbSet<ApplicationRecord> Applications { get; set; } = null!;
        public virtual DbSet<LogicalModel> LogicalModels { get; set; } = null!;
        public virtual DbSet<ModelVariant> ModelVariants { get; set; } = null!;
        public virtual DbSet<ModelVersion> ModelVersions { get; set; } = null!;
        public virtual DbSet<Vocabulary> Vocabularies { get; set; } = null!;
        public virtual DbSet<VocabularyTerm> VocabularyTerms { get; set; } = null!;
        public virtual DbSet<MetadataAssignment> MetadataAssignments { get; set; } = null!;
        public virtual DbSet<PersonalAccessToken> PersonalAccessTokens { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.UseCollation("Latin1_General_CI_AS");

            modelBuilder.Entity<DataModel>(entity =>
            {
                entity.HasKey(e => e.Id).IsClustered();
                entity.Property(e => e.OwnerId).UseCollation("Latin1_General_100_BIN2");
                entity.Property<int?>(OwnerIdByteLengthColumn)
                    .HasComputedColumnSql("DATALENGTH([OwnerId])", stored: true);
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("getdate()");
                entity.HasIndex(
                        nameof(DataModel.OwnerId),
                        nameof(DataModel.Keyword),
                        nameof(DataModel.Version),
                        OwnerIdByteLengthColumn)
                    .IsUnique()
                    .HasFilter(null)
                    .IsClustered(false);
            });

            modelBuilder.Entity<DataModelAccessGrant>(entity =>
            {
                entity.HasKey(e => e.Id).IsClustered();
                entity.Property(e => e.OwnerId).UseCollation("Latin1_General_100_BIN2");
                entity.Property(e => e.TargetId).UseCollation("Latin1_General_100_BIN2");
                entity.Property<int>(OwnerIdByteLengthColumn)
                    .HasComputedColumnSql("DATALENGTH([OwnerId])", stored: true);
                entity.Property<int>("TargetIdByteLength")
                    .HasComputedColumnSql("DATALENGTH([TargetId])", stored: true);
                entity.Property(e => e.Permission).HasDefaultValue("View");
                entity.HasIndex(
                        nameof(DataModelAccessGrant.OwnerId),
                        nameof(DataModelAccessGrant.Keyword),
                        nameof(DataModelAccessGrant.TargetType),
                        nameof(DataModelAccessGrant.TargetId),
                        OwnerIdByteLengthColumn,
                        "TargetIdByteLength")
                    .IsUnique()
                    .IsClustered(false);
                entity.HasIndex(
                    nameof(DataModelAccessGrant.TargetType),
                    nameof(DataModelAccessGrant.TargetId),
                    nameof(DataModelAccessGrant.Permission),
                    "TargetIdByteLength");
            });

            modelBuilder.Entity<ApplicationRecord>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.Owner, x.Name }).IsUnique();
            });
            modelBuilder.Entity<LogicalModel>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.ApplicationId, x.Name }).IsUnique();
                entity.HasOne(x => x.Application).WithMany().HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Cascade);
            });
            modelBuilder.Entity<ModelVariant>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.ModelId, x.Name }).IsUnique();
                entity.HasIndex(x => new { x.ModelId, x.IdempotencyKey }).IsUnique();
                entity.HasOne(x => x.Model).WithMany(x => x.Variants).HasForeignKey(x => x.ModelId).OnDelete(DeleteBehavior.Cascade);
            });
            modelBuilder.Entity<ModelVersion>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.VariantId, x.Number }).IsUnique();
                entity.HasIndex(x => new { x.VariantId, x.IdempotencyKey }).IsUnique()
                    .HasFilter("[IdempotencyKey] IS NOT NULL AND [IdempotencyKey] <> ''");
                entity.Property(x => x.ConcurrencyToken).IsRowVersion();
                entity.HasOne(x => x.Variant).WithMany(x => x.Versions).HasForeignKey(x => x.VariantId).OnDelete(DeleteBehavior.Cascade);
            });
            modelBuilder.Entity<Vocabulary>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.Name, x.Version }).IsUnique();
            });
            modelBuilder.Entity<VocabularyTerm>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.VocabularyId, x.Code }).IsUnique();
                entity.HasOne(x => x.Vocabulary).WithMany(x => x.Terms).HasForeignKey(x => x.VocabularyId).OnDelete(DeleteBehavior.Cascade);
            });
            modelBuilder.Entity<MetadataAssignment>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => new { x.VocabularyTermId, x.TargetType, x.TargetId }).IsUnique();
                entity.HasOne(x => x.VocabularyTerm).WithMany().HasForeignKey(x => x.VocabularyTermId).OnDelete(DeleteBehavior.Restrict);
            });
            modelBuilder.Entity<PersonalAccessToken>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.HasIndex(x => x.TokenHash).IsUnique();
                entity.HasIndex(x => new { x.Owner, x.RevokedAt, x.ExpiresAt });
            });
        }
    }
}