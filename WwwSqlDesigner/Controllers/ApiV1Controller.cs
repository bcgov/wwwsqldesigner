using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WwwSqlDesigner.Data;
using WwwSqlDesigner.Services;

namespace WwwSqlDesigner.Controllers;

[ApiController]
public abstract class DataArchitectureControllerBase : ControllerBase
{
    private static readonly string[] EmptyDiagnostics = Array.Empty<string>();
    private static readonly string[] EmptyArtifactDiagnostics = ["Artifact is empty."];
    private static readonly SemaphoreSlim VersionPublicationGate = new(1, 1);
    private readonly ApplicationDbContext _db;
    private readonly SchemaExportService _exports;
    protected abstract string ApiBasePath { get; }
    protected DataArchitectureControllerBase(ApplicationDbContext db, SchemaExportService exports)
    {
        _db = db;
        _exports = exports;
    }

    [HttpGet("models")]
    public async Task<IActionResult> ListModels(Guid? applicationId, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        return Ok(await _db.LogicalModels.AsNoTracking().Where(x => x.Owner == auth.Value.Owner && (!applicationId.HasValue || x.ApplicationId == applicationId))
            .OrderBy(x => x.Name).Select(x => new { x.Id, x.ApplicationId, x.Name, x.Description, variants = x.Variants.OrderBy(v => v.Name).Select(v => new { v.Id, v.Name }) }).ToListAsync(ct));
    }

    [HttpGet("models/{id:guid}/variants")]
    public async Task<IActionResult> Variants(Guid id, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        return Ok(await _db.ModelVariants.AsNoTracking().Where(x => x.ModelId == id && x.Model!.Owner == auth.Value.Owner)
            .OrderBy(x => x.Name).Select(x => new { x.Id, x.ModelId, x.Name, versionCount = x.Versions.Count }).ToListAsync(ct));
    }

    [HttpGet("models/{id:guid}/variants/{variantId:guid}/versions/{versionId:guid}")]
    public async Task<IActionResult> Version(Guid id, Guid variantId, Guid versionId, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        var version = await LoadVersion(id, variantId, versionId, auth.Value.Owner, ct);
        return version is null ? NotFound() : Ok(new { version.Id, version.Number, version.ContentSha256, version.SnapshotJson, version.CreatedAt, version.CreatedBy, provenance = "SQL Designer canonical store" });
    }

    [HttpPost("applications")]
    public async Task<IActionResult> CreateApplication(ApplicationRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ApplicationsCreate, ct); if (auth is null) return UnauthorizedOrForbidden();
        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest("Name is required.");
        var app = new ApplicationRecord { Name = request.Name, Description = request.Description, Status = request.Status ?? "Active", Owner = auth.Value.Owner };
        _db.Applications.Add(app); await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(GetApplication), new { id = app.Id }, new { id = app.Id, app.Name, app.Description, app.Status, app.Owner });
    }

    [HttpGet("applications")]
    public async Task<IActionResult> ListApplications(CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ApplicationsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        return Ok(await _db.Applications.AsNoTracking().Where(x => x.Owner == auth.Value.Owner).OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Description, x.Status, x.Owner }).ToListAsync(ct));
    }

    [HttpGet("applications/{id:guid}")]
    public async Task<IActionResult> GetApplication(Guid id, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ApplicationsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        var app = await _db.Applications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Owner == auth.Value.Owner, ct);
        return app is null ? NotFound() : Ok(new { app.Id, app.Name, app.Description, app.Status, app.Owner });
    }

    [HttpPost("models")]
    public async Task<IActionResult> CreateModel(ModelRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsWrite, ct); if (auth is null) return UnauthorizedOrForbidden();
        if (!await _db.Applications.AnyAsync(x => x.Id == request.ApplicationId && x.Owner == auth.Value.Owner, ct)) return NotFound();
        var model = new LogicalModel { ApplicationId = request.ApplicationId, Name = request.Name, Description = request.Description, Owner = auth.Value.Owner };
        var variantName = request.Variant ?? "default";
        var key = request.IdempotencyKey ?? Guid.NewGuid().ToString("N");
        var existing = await _db.ModelVariants.Include(x => x.Model).SingleOrDefaultAsync(x => x.IdempotencyKey == key && x.Model!.Owner == auth.Value.Owner, ct);
        if (existing is not null) return Ok(new { modelId = existing.ModelId, modelName = existing.Model!.Name, variantId = existing.Id, variantName = existing.Name, idempotent = true });
        var variant = new ModelVariant { Model = model, Name = variantName, IdempotencyKey = key };
        _db.LogicalModels.Add(model); _db.ModelVariants.Add(variant); await _db.SaveChangesAsync(ct);
        return Created($"{ApiBasePath}/models/{model.Id}", new { modelId = model.Id, modelName = model.Name, variantId = variant.Id, variantName = variant.Name });
    }

    [HttpGet("models/{id:guid}/variants/{variantId:guid}/versions")]
    public async Task<IActionResult> Versions(Guid id, Guid variantId, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        var variant = await _db.ModelVariants.Include(x => x.Model).SingleOrDefaultAsync(x => x.Id == variantId && x.ModelId == id && x.Model!.Owner == auth.Value.Owner, ct);
        return variant is null ? NotFound() : Ok(await _db.ModelVersions.AsNoTracking().Where(x => x.VariantId == variant.Id).OrderBy(x => x.Number).Select(x => new { x.Id, x.Number, x.ContentSha256, x.CreatedAt, x.CreatedBy }).ToListAsync(ct));
    }

    [HttpGet("fragments/{id:guid}/variants/{variantId:guid}/versions")]
    public Task<IActionResult> FragmentVersions(Guid id, Guid variantId, CancellationToken ct) => Versions(id, variantId, ct);

    [HttpGet("models/{id:guid}/variants/{variantId:guid}/compare")]
    public async Task<IActionResult> Compare(Guid id, Guid variantId, int left, int right, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        var versions = await _db.ModelVersions.Include(x => x.Variant).ThenInclude(x => x!.Model)
            .Where(x => x.VariantId == variantId && x.Variant!.ModelId == id && x.Variant.Model!.Owner == auth.Value.Owner && (x.Number == left || x.Number == right))
            .OrderBy(x => x.Number).ToListAsync(ct);
        if (versions.Count != 2) return NotFound();
        return Ok(new { left = versions[0].Number, right = versions[1].Number, changed = versions[0].ContentSha256 != versions[1].ContentSha256, checksums = versions.Select(x => x.ContentSha256) });
    }

    [HttpPost("models/{id:guid}/variants/{variantId:guid}/validate")]
    public async Task<IActionResult> Validate(Guid id, Guid variantId, VersionRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        if (!await _db.ModelVariants.AnyAsync(x => x.Id == variantId && x.ModelId == id && x.Model!.Owner == auth.Value.Owner, ct)) return NotFound();
        try { _ = JsonSerializer.Deserialize<JsonElement>(request.SnapshotJson); return Ok(new { valid = true, diagnostics = Array.Empty<string>() }); }
        catch (JsonException e) { return Ok(new { valid = false, diagnostics = new[] { e.Message } }); }
    }

    [HttpPost("models/{id:guid}/variants/{variantId:guid}/versions")]
    public async Task<IActionResult> CreateVersion(Guid id, Guid variantId, VersionRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsWrite, ct); if (auth is null) return UnauthorizedOrForbidden();
        var variant = await _db.ModelVariants.Include(x => x.Model).SingleOrDefaultAsync(x => x.Id == variantId && x.ModelId == id && x.Model!.Owner == auth.Value.Owner, ct);
        if (variant is null) return NotFound();
        JsonElement snapshot;
        try { snapshot = JsonSerializer.Deserialize<JsonElement>(request.SnapshotJson); }
        catch (JsonException e) { return BadRequest(new { error = "Snapshot must be valid JSON.", detail = e.Message }); }
        var canonical = JsonSerializer.Serialize(snapshot);
        if (!string.IsNullOrWhiteSpace(request.ExpectedChecksum))
        {
            var current = await _db.ModelVersions.Where(x => x.VariantId == variant.Id).OrderByDescending(x => x.Number).FirstOrDefaultAsync(ct);
            if (current is not null && !string.Equals(current.ContentSha256, request.ExpectedChecksum, StringComparison.OrdinalIgnoreCase))
                return Conflict(new { error = "Optimistic concurrency check failed.", currentChecksum = current.ContentSha256 });
        }
        await VersionPublicationGate.WaitAsync(ct);
        try
        {
            var existing = await _db.ModelVersions.SingleOrDefaultAsync(x => x.VariantId == variant.Id && x.IdempotencyKey == request.IdempotencyKey, ct);
            if (existing is not null)
            {
                if (!string.Equals(existing.ContentSha256, Sha256(canonical), StringComparison.OrdinalIgnoreCase))
                    return Conflict(new { error = "Idempotency key was already used with a different snapshot.", code = "idempotency_conflict" });
                return Ok(new { existing.Id, existing.Number, existing.ContentSha256, idempotent = true });
            }
            await using var transaction = _db.Database.IsRelational() ? await _db.Database.BeginTransactionAsync(ct) : null;
            var number = await _db.ModelVersions.Where(x => x.VariantId == variant.Id).Select(x => (int?)x.Number).MaxAsync(ct) ?? 0;
            var version = new ModelVersion { VariantId = variant.Id, Number = number + 1, IdempotencyKey = request.IdempotencyKey, SnapshotJson = canonical, ContentSha256 = Sha256(canonical), CreatedBy = auth.Value.Owner };
            _db.ModelVersions.Add(version);
            try { await _db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateException) { return Conflict(new { error = "Version publication conflict.", code = "version_conflict" }); }
            return Created($"{ApiBasePath}/models/{id}/variants/{variantId}/versions/{version.Number}", new { version.Id, version.Number, version.ContentSha256 });
        }
        finally { VersionPublicationGate.Release(); }
    }

    [HttpGet("vocabularies")]
    public async Task<IActionResult> Vocabularies(CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.VocabulariesRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        return Ok(await _db.Vocabularies.AsNoTracking().Include(x => x.Terms).OrderBy(x => x.Name).ThenBy(x => x.Version).ToListAsync(ct));
    }

    [HttpPost("models/import/preview")]
    public async Task<IActionResult> ImportPreview(ImportRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsImport, ct); if (auth is null) return UnauthorizedOrForbidden();
        if (string.IsNullOrWhiteSpace(request.Content)) return Ok(new { supported = false, diagnostics = EmptyArtifactDiagnostics, format = "unknown", schema = (object?)null });
        var parsed = ParseImport(request.FileName, request.Content);
        return Ok(new { supported = parsed.Schema is not null && parsed.Diagnostics.Count == 0, diagnostics = parsed.Diagnostics, format = parsed.Format, schema = parsed.Schema });
    }

    [HttpPost("models/import/publish")]
    public async Task<IActionResult> ImportPublish(ImportPublishRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsImport, ct); if (auth is null) return UnauthorizedOrForbidden();
        var parsed = ParseImport(request.FileName, request.Content);
        if (parsed.Schema is null || parsed.Diagnostics.Count != 0)
            return UnprocessableEntity(new { supported = false, diagnostics = parsed.Diagnostics });
        if (!await _db.LogicalModels.AnyAsync(x => x.Id == request.ModelId && x.Owner == auth.Value.Owner, ct)) return NotFound();
        var variant = await _db.ModelVariants.SingleOrDefaultAsync(x => x.Id == request.VariantId && x.ModelId == request.ModelId, ct);
        if (variant is null) return NotFound();
        var snapshot = JsonSerializer.Serialize(parsed.Schema);
        await VersionPublicationGate.WaitAsync(ct);
        try
        {
            var existing = await _db.ModelVersions.SingleOrDefaultAsync(x => x.VariantId == variant.Id && x.IdempotencyKey == request.IdempotencyKey, ct);
            if (existing is not null)
            {
                if (!string.Equals(existing.ContentSha256, Sha256(snapshot), StringComparison.OrdinalIgnoreCase))
                    return Conflict(new { error = "Idempotency key was already used with different artifact content.", code = "idempotency_conflict" });
                return Ok(new { versionId = existing.Id, existing.Number, diagnostics = EmptyDiagnostics, idempotent = true });
            }
            await using var transaction = _db.Database.IsRelational() ? await _db.Database.BeginTransactionAsync(ct) : null;
            var number = await _db.ModelVersions.Where(x => x.VariantId == variant.Id).Select(x => (int?)x.Number).MaxAsync(ct) ?? 0;
            var version = new ModelVersion { VariantId = variant.Id, Number = number + 1, IdempotencyKey = request.IdempotencyKey, SnapshotJson = snapshot, ContentSha256 = Sha256(snapshot), CreatedBy = auth.Value.Owner };
            _db.ModelVersions.Add(version);
            try { await _db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct); }
            catch (DbUpdateException) { return Conflict(new { error = "Version publication conflict.", code = "version_conflict" }); }
            return Ok(new { versionId = version.Id, version.Number, diagnostics = EmptyDiagnostics });
        }
        finally { VersionPublicationGate.Release(); }
    }

    [HttpPost("models/{id:guid}/variants/{variantId:guid}/versions/{versionId:guid}/export")]
    public async Task<IActionResult> Export(Guid id, Guid variantId, Guid versionId, ExportRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsExport, ct); if (auth is null) return UnauthorizedOrForbidden();
        var latest = await _db.ModelVersions.Include(x => x.Variant).ThenInclude(x => x!.Model)
            .SingleOrDefaultAsync(x => x.Id == versionId && x.VariantId == variantId && x.Variant!.ModelId == id && x.Variant.Model!.Owner == auth.Value.Owner, ct);
        if (latest is null) return NotFound();
        CanonicalSchema schema;
        try { schema = SchemaExportService.ReadSnapshot(latest.SnapshotJson); }
        catch (JsonException e) { return UnprocessableEntity(new { diagnostics = new[] { new { code = "invalid-snapshot", message = e.Message } } }); }
        var metadataTerms = await LoadExportMetadataTerms(schema, ct);
        var exported = _exports.Export(schema, request.Format, metadataTerms);
        return Ok(new { content = exported.Content, sidecar = exported.Sidecar, checksum = exported.Checksum, diagnostics = exported.Diagnostics });
    }

    [HttpGet("models/{id:guid}/variants/{variantId:guid}/versions/{versionId:guid}/metadata")]
    public async Task<IActionResult> GetMetadata(Guid id, Guid variantId, Guid versionId, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsRead, ct); if (auth is null) return UnauthorizedOrForbidden();
        var version = await LoadVersion(id, variantId, versionId, auth.Value.Owner, ct);
        if (version is null) return NotFound();
        var schema = SchemaExportService.ReadSnapshot(version.SnapshotJson);
        var assignments = schema.MetadataAssignments ?? Array.Empty<CanonicalMetadataAssignment>();
        var direct = assignments.GroupBy(x => (x.TargetType, x.TargetId))
            .ToDictionary(x => x.Key, x => x.ToArray());
        var effective = new List<CanonicalMetadataAssignment>();
        foreach (var table in schema.Tables)
        {
            if (table.Id is not Guid tableId) continue;
            AddEffective(MetadataTargetType.Entity, tableId, direct, effective);
            foreach (var column in table.Columns)
            {
                if (column.Id is not Guid columnId) continue;
                CanonicalMetadataAssignment[] inherited;
                if (direct.TryGetValue((MetadataTargetType.Property, columnId), out var property))
                    inherited = property;
                else if (direct.TryGetValue((MetadataTargetType.Entity, tableId), out var entity))
                    inherited = entity.Select(x => x with { TargetType = MetadataTargetType.Property, TargetId = columnId }).ToArray();
                else if (direct.TryGetValue((MetadataTargetType.Model, id), out var model))
                    inherited = model.Select(x => x with { TargetType = MetadataTargetType.Property, TargetId = columnId }).ToArray();
                else
                    inherited = Array.Empty<CanonicalMetadataAssignment>();
                effective.AddRange(inherited);
            }
        }
        AddEffective(MetadataTargetType.Model, id, direct, effective);
        return Ok(new { assignments, effective });
    }

    [HttpPost("models/{id:guid}/variants/{variantId:guid}/versions/{versionId:guid}/metadata")]
    public async Task<IActionResult> SetMetadata(Guid id, Guid variantId, Guid versionId, MetadataRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsWrite, ct); if (auth is null) return UnauthorizedOrForbidden();
        var version = await LoadVersion(id, variantId, versionId, auth.Value.Owner, ct);
        if (version is null) return NotFound();
        var schema = SchemaExportService.ReadSnapshot(version.SnapshotJson);
        var entityTargets = new HashSet<Guid>();
        var propertyTargets = new HashSet<Guid>();
        foreach (var table in schema.Tables)
        {
            if (table.Id is Guid tableId)
            {
                entityTargets.Add(tableId);
                foreach (var column in table.Columns)
                    if (column.Id is Guid columnId) propertyTargets.Add(columnId);
            }
        }
        foreach (var item in request.Assignments)
        {
            var targetValid = item.TargetType switch
            {
                MetadataTargetType.Model => item.TargetId == id,
                MetadataTargetType.Entity => entityTargets.Contains(item.TargetId),
                MetadataTargetType.Property => propertyTargets.Contains(item.TargetId),
                _ => false
            };
            if (!targetValid) return BadRequest(new { error = "Metadata target is not present in the selected version.", targetId = item.TargetId });
            if (!await _db.VocabularyTerms.AnyAsync(x => x.Id == item.VocabularyTermId, ct)) return BadRequest(new { error = "Vocabulary term does not exist.", vocabularyTermId = item.VocabularyTermId });
        }
        var merged = (schema.MetadataAssignments ?? Array.Empty<CanonicalMetadataAssignment>())
            .Where(existing => !request.Assignments.Any(item => item.TargetType == existing.TargetType && item.TargetId == existing.TargetId))
            .Concat(request.Assignments.Select(x => new CanonicalMetadataAssignment(x.TargetType, x.TargetId, x.VocabularyTermId, x.RetentionDisposition)))
            .ToArray();
        var snapshot = JsonSerializer.Serialize(schema with { MetadataAssignments = merged });
        var publication = await CreateVersion(id, variantId, new VersionRequest(snapshot, request.IdempotencyKey, request.ExpectedChecksum), ct);
        return publication;
    }

    private Task<ModelVersion?> LoadVersion(Guid modelId, Guid variantId, Guid versionId, string owner, CancellationToken ct) =>
        _db.ModelVersions.Include(x => x.Variant).ThenInclude(x => x!.Model)
            .SingleOrDefaultAsync(x => x.Id == versionId && x.VariantId == variantId && x.Variant!.ModelId == modelId && x.Variant.Model!.Owner == owner, ct);

    private static void AddEffective(
        MetadataTargetType targetType,
        Guid lookupId,
        Dictionary<(MetadataTargetType, Guid), CanonicalMetadataAssignment[]> direct,
        List<CanonicalMetadataAssignment> effective)
    {
        if (direct.TryGetValue((targetType, lookupId), out var assignments))
            foreach (var assignment in assignments) effective.Add(assignment);
    }

    [HttpPost("export")]
    public async Task<IActionResult> ExportArtifact(ExportArtifactRequest request, CancellationToken ct)
    {
        var auth = await Authorize(PatScopes.ModelsExport, ct); if (auth is null) return UnauthorizedOrForbidden();
        CanonicalSchema schema;
        try { schema = SchemaExportService.ReadSnapshot(request.Xml); }
        catch (Exception e) when (e is JsonException or InvalidOperationException or FormatException or XmlException) { return BadRequest(new { error = "Artifact could not be parsed.", detail = e.Message }); }
        var metadataTerms = await LoadExportMetadataTerms(schema, ct);
        var result = _exports.Export(schema, request.Format, metadataTerms);
        return Ok(new { content = result.Content, sidecar = result.Sidecar, checksum = result.Checksum, diagnostics = result.Diagnostics });
    }

    private async Task<Dictionary<Guid, ExportMetadataTerm>> LoadExportMetadataTerms(
        CanonicalSchema schema,
        CancellationToken ct)
    {
        var termIds = (schema.MetadataAssignments ?? Array.Empty<CanonicalMetadataAssignment>())
            .Select(assignment => assignment.VocabularyTermId)
            .Distinct()
            .ToArray();
        return await _db.VocabularyTerms.AsNoTracking()
            .Include(term => term.Vocabulary)
            .Where(term => termIds.Contains(term.Id))
            .ToDictionaryAsync(
                term => term.Id,
                term => new ExportMetadataTerm(
                    term.Id,
                    term.Vocabulary!.Name,
                    term.Vocabulary.Version,
                    term.Code,
                    term.Description),
                ct);
    }

    protected abstract Task<(string Owner, PersonalAccessToken Token)?> Authorize(string scope, CancellationToken ct);
    protected abstract IActionResult UnauthorizedOrForbidden();
    private static ImportResult ParseImport(string fileName, string content) =>
        SchemaImportService.Parse(fileName, content);
    private static string Sha256(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}

public sealed record CreateTokenRequest(string[] Scopes, [property: JsonRequired] TimeSpan ExpiresIn, string? Name);
public sealed record ApplicationRequest(string Name, string? Description, string? Status);
public sealed record ModelRequest([property: JsonRequired] Guid ApplicationId, string Name, string? Description, string? Variant, string? IdempotencyKey);
public sealed record VersionRequest(string SnapshotJson, [property: JsonRequired] string IdempotencyKey, string? ExpectedChecksum);
public sealed record ImportRequest(string FileName, string Content);
public sealed record ImportPublishRequest([property: JsonRequired] Guid ModelId, [property: JsonRequired] Guid VariantId, string FileName, string Content, string IdempotencyKey);
public sealed record ExportRequest(string Format);
public sealed record ExportArtifactRequest(string Format, string Xml);
public sealed record MetadataRequest(
    IReadOnlyList<MetadataAssignmentInput> Assignments,
    [property: JsonRequired] string IdempotencyKey,
    [property: JsonRequired] string ExpectedChecksum);
public sealed record MetadataAssignmentInput(MetadataTargetType TargetType, Guid TargetId, Guid VocabularyTermId, string? RetentionDisposition);
