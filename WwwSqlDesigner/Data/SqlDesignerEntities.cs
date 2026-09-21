using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace WwwSqlDesigner.Data;

public enum ApplicationStatus { Active, Archived }
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MetadataTargetType { Model, Entity, Property }

public sealed class ApplicationRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(200), Required] public string Name { get; set; } = null!;
    [MaxLength(4000)] public string? Description { get; set; }
    [MaxLength(32), Required] public string Status { get; set; } = ApplicationStatus.Active.ToString();
    [MaxLength(256), Required] public string Owner { get; set; } = null!;
}

public sealed class LogicalModel
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    [MaxLength(200), Required] public string Name { get; set; } = null!;
    [MaxLength(4000)] public string? Description { get; set; }
    [MaxLength(256), Required] public string Owner { get; set; } = null!;
    public ApplicationRecord? Application { get; set; }
    public ICollection<ModelVariant> Variants { get; set; } = new List<ModelVariant>();
}

public sealed class ModelVariant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ModelId { get; set; }
    [MaxLength(120), Required] public string Name { get; set; } = null!;
    [MaxLength(64), Required] public string IdempotencyKey { get; set; } = null!;
    public LogicalModel? Model { get; set; }
    public ICollection<ModelVersion> Versions { get; set; } = new List<ModelVersion>();
}

public sealed class ModelVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid VariantId { get; set; }
    public int Number { get; set; }
    [Required] public string SnapshotJson { get; set; } = "{}";
    [MaxLength(128), Required] public string ContentSha256 { get; set; } = null!;
    [MaxLength(64)] public string? IdempotencyKey { get; set; }
    [MaxLength(256), Required] public string CreatedBy { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [Timestamp] public byte[] ConcurrencyToken { get; set; } = Array.Empty<byte>();
    public ModelVariant? Variant { get; set; }
}

public sealed class Vocabulary
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120), Required] public string Name { get; set; } = null!;
    public int Version { get; set; }
    [MaxLength(4000)] public string? Description { get; set; }
    public ICollection<VocabularyTerm> Terms { get; set; } = new List<VocabularyTerm>();
}

public sealed class VocabularyTerm
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid VocabularyId { get; set; }
    [MaxLength(120), Required] public string Code { get; set; } = null!;
    [MaxLength(4000)] public string? Description { get; set; }
    public Vocabulary? Vocabulary { get; set; }
}

public sealed class MetadataAssignment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid VocabularyTermId { get; set; }
    public MetadataTargetType TargetType { get; set; }
    public Guid TargetId { get; set; }
    [MaxLength(32)] public string? RetentionDisposition { get; set; }
    public VocabularyTerm? VocabularyTerm { get; set; }
}

public sealed class PersonalAccessToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(256), Required] public string Owner { get; set; } = null!;
    [MaxLength(32), Required] public string Prefix { get; set; } = null!;
    [MaxLength(120)] public string? Name { get; set; }
    [MaxLength(64), Required] public string TokenHash { get; set; } = null!;
    [MaxLength(1000), Required] public string ScopesJson { get; set; } = "[]";
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
