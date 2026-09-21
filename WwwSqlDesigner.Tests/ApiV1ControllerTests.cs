using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Moq;
using WwwSqlDesigner.Controllers;
using WwwSqlDesigner.Data;
using WwwSqlDesigner.Services;

namespace WwwSqlDesigner.Tests;

[TestClass]
public sealed class ApiV1ControllerTests
{
    private static readonly string[] DataModelIdentityProperties =
        ["OwnerId", "Keyword", "Version", "OwnerIdByteLength"];

    public TestContext TestContext { get; set; } = null!;

    private static (ApplicationDbContext Db, ApiV1Controller Api, PatTokenService Tokens) CreateApi(
        string owner = "owner",
        bool csrfValid = true,
        string? bearer = null)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new ApplicationDbContext(options);
        var tokens = new PatTokenService(db);
        var antiforgery = new Mock<IAntiforgery>();
        if (csrfValid)
            antiforgery.Setup(x => x.ValidateRequestAsync(It.IsAny<HttpContext>())).Returns(Task.CompletedTask);
        else
            antiforgery.Setup(x => x.ValidateRequestAsync(It.IsAny<HttpContext>()))
                .ThrowsAsync(new AntiforgeryValidationException("missing"));
        var api = new ApiV1Controller(db, tokens, new SchemaExportService(), antiforgery.Object);
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, owner)], "cookie"));
        if (bearer is not null)
            context.Request.Headers.Authorization = $"Bearer {bearer}";
        api.ControllerContext = new ControllerContext { HttpContext = context };
        return (db, api, tokens);
    }

    [TestMethod]
    public async Task TokenPlaintextIsReturnedOnceAndMetadataCanBeListedAndRevoked()
    {
        var (db, api, _) = CreateApi();
        var created = await api.CreateToken(
            new CreateTokenRequest(["applications:read"], TimeSpan.FromDays(7), "build"),
            TestContext.CancellationToken);

        var payload = ((ObjectResult)created).Value!;
        var plaintext = payload.GetType().GetProperty("token")!.GetValue(payload) as string;
        Assert.IsTrue(plaintext!.StartsWith("sqd_", StringComparison.Ordinal));
        Assert.AreEqual("build", payload.GetType().GetProperty("name")!.GetValue(payload));
        Assert.IsFalse(string.IsNullOrWhiteSpace(plaintext));

        var list = (OkObjectResult)await api.ListTokens(TestContext.CancellationToken);
        Assert.Contains("applications:read", JsonSerializer.Serialize(list.Value));
        Assert.DoesNotContain(plaintext, JsonSerializer.Serialize(list.Value));

        var id = (Guid)payload.GetType().GetProperty("id")!.GetValue(payload)!;
        Assert.IsInstanceOfType<NoContentResult>(await api.RevokeToken(id, TestContext.CancellationToken));
        Assert.IsNotNull(await db.PersonalAccessTokens.SingleAsync(
            x => x.Id == id && x.RevokedAt != null,
            TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task TokenExpiryAndScopeValidationAreBounded()
    {
        var (db, _, tokens) = CreateApi();
        await Assert.ThrowsAsync<ArgumentException>(() =>
            tokens.CreateAsync("owner", [PatScopes.ModelsRead], TimeSpan.FromDays(91), "too-long", TestContext.CancellationToken));
        await Assert.ThrowsAsync<ArgumentException>(() =>
            tokens.CreateAsync("owner", ["admin:all"], TimeSpan.FromDays(1), "unknown-scope", TestContext.CancellationToken));

        var expired = await tokens.CreateAsync("owner", [PatScopes.ModelsRead], TimeSpan.FromDays(1), "expired", TestContext.CancellationToken);
        expired.Token.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await db.SaveChangesAsync(TestContext.CancellationToken);
        Assert.IsNull(await tokens.ValidateAsync(expired.Plaintext, PatScopes.ModelsRead, TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task TokenCreationEnforcesTheActiveTokenLimit()
    {
        var (_, _, tokens) = CreateApi();
        for (var index = 0; index < 10; index++)
        {
            await tokens.CreateAsync(
                "owner",
                [PatScopes.ModelsRead],
                TimeSpan.FromDays(1),
                $"token-{index}",
                TestContext.CancellationToken);
        }

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            tokens.CreateAsync(
                "owner",
                [PatScopes.ModelsRead],
                TimeSpan.FromDays(1),
                "token-over-limit",
                TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task CookieWritesRequireAntiforgeryAndBearerWritesDoNot()
    {
        var (_, cookieApi, _) = CreateApi(csrfValid: false);
        var missing = await cookieApi.CreateApplication(new ApplicationRequest("blocked", null, null), TestContext.CancellationToken);
        Assert.AreEqual(400, ((IStatusCodeActionResult)missing).StatusCode ?? 400);

        var (_, bearerApi, tokens) = CreateApi(csrfValid: false);
        var pat = await tokens.CreateAsync("owner", [PatScopes.ApplicationsCreate], TimeSpan.FromDays(7), "automation", TestContext.CancellationToken);
        bearerApi.HttpContext.Request.Headers.Authorization = $"Bearer {pat.Plaintext}";
        var created = await bearerApi.CreateApplication(new ApplicationRequest("allowed", null, null), TestContext.CancellationToken);
        Assert.IsInstanceOfType<CreatedAtActionResult>(created);

        var (_, malformedApi, _) = CreateApi(csrfValid: false, bearer: "not-a-token");
        var denied = await malformedApi.CreateApplication(new ApplicationRequest("not-allowed", null, null), TestContext.CancellationToken);
        Assert.IsInstanceOfType<ForbidResult>(denied);
        _ = bearerApi;
    }

    [TestMethod]
    public async Task EveryCookieModelWriteCategoryRequiresAntiforgery()
    {
        static void AssertBadRequest(IActionResult result) =>
            Assert.AreEqual(400, ((IStatusCodeActionResult)result).StatusCode ?? 400);

        var (_, modelApi, _) = CreateApi(csrfValid: false);
        AssertBadRequest(await modelApi.CreateToken(
            new CreateTokenRequest([PatScopes.ModelsRead], TimeSpan.FromDays(1), "blocked"),
            TestContext.CancellationToken));
        AssertBadRequest(await modelApi.RevokeToken(Guid.NewGuid(), TestContext.CancellationToken));
        AssertBadRequest(await modelApi.CreateModel(new ModelRequest(Guid.NewGuid(), "model", null, "default", "id"), TestContext.CancellationToken));
        AssertBadRequest(await modelApi.Validate(
            Guid.NewGuid(),
            Guid.NewGuid(),
            new VersionRequest("{}", "id", null),
            TestContext.CancellationToken));
        AssertBadRequest(await modelApi.CreateVersion(Guid.NewGuid(), Guid.NewGuid(), new VersionRequest("{}", "id", null), TestContext.CancellationToken));
        AssertBadRequest(await modelApi.ImportPreview(new ImportRequest("model.sql", "CREATE TABLE t (id INTEGER);"), TestContext.CancellationToken));
        AssertBadRequest(await modelApi.ImportPublish(new ImportPublishRequest(Guid.NewGuid(), Guid.NewGuid(), "model.sql", "CREATE TABLE t (id INTEGER);", "id"), TestContext.CancellationToken));
        AssertBadRequest(await modelApi.Export(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            new ExportRequest("mssql"),
            TestContext.CancellationToken));
        AssertBadRequest(await modelApi.SetMetadata(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), new MetadataRequest([], "id", "checksum"), TestContext.CancellationToken));
        AssertBadRequest(await modelApi.ExportArtifact(
            new ExportArtifactRequest("mssql", "{\"tables\":[]}"),
            TestContext.CancellationToken));
    }

    [TestMethod]
    public void SqlDesignerOwnerComparisonsAreCaseSensitive()
    {
        var (db, _, _) = CreateApi();
        var model = db.GetService<IDesignTimeModel>().Model;
        foreach (var entityType in new[]
        {
            typeof(ApplicationRecord),
            typeof(LogicalModel),
            typeof(PersonalAccessToken)
        })
        {
            var owner = model.FindEntityType(entityType)!.FindProperty("Owner")!;
            Assert.AreEqual("Latin1_General_100_BIN2", owner.GetCollation(), entityType.Name);
        }

        var dataModel = model.FindEntityType(typeof(DataModel))!;
        var identityIndex = dataModel.GetIndexes().Single(index =>
            index.Properties.Select(property => property.Name).SequenceEqual(
                DataModelIdentityProperties));
        Assert.IsNull(identityIndex.GetFilter());
    }

    [TestMethod]
    public async Task ApplicationModelVariantAndVersionNavigationIsOwnerScoped()
    {
        var (db, api, _) = CreateApi();
        var app = (CreatedAtActionResult)await api.CreateApplication(new ApplicationRequest("catalog", null, null), TestContext.CancellationToken);
        var appId = (Guid)app.Value!.GetType().GetProperty("id")!.GetValue(app.Value)!;
        var model = (CreatedResult)await api.CreateModel(new ModelRequest(appId, "orders", null, "default", "create-1"), TestContext.CancellationToken);
        var modelId = (Guid)model.Value!.GetType().GetProperty("modelId")!.GetValue(model.Value)!;
        var variantId = (Guid)model.Value!.GetType().GetProperty("variantId")!.GetValue(model.Value)!;
        var modelTarget = Guid.NewGuid();
        var term = new VocabularyTerm { Code = "PROTECTED_B", Description = "Protected B" };
        var vocabulary = new Vocabulary { Name = "test-vocabulary", Version = 1 };
        vocabulary.Terms.Add(term);
        db.Vocabularies.Add(vocabulary);
        await db.SaveChangesAsync(TestContext.CancellationToken);
        var version = (CreatedResult)await api.CreateVersion(modelId, variantId,
            new VersionRequest(JsonSerializer.Serialize(new CanonicalSchema(
                [new SchemaTable("orders", [], modelTarget)])), "publish-1", null), TestContext.CancellationToken);
        var versionId = (Guid)version.Value!.GetType().GetProperty("Id")!.GetValue(version.Value)!;
        var versions = (OkObjectResult)await api.Versions(modelId, variantId, TestContext.CancellationToken);
        Assert.HasCount(1, (IEnumerable<object>)versions.Value!);
        Assert.IsInstanceOfType<OkObjectResult>(await api.Version(modelId, variantId, versionId, TestContext.CancellationToken));
        var metadata = await api.SetMetadata(modelId, variantId, versionId,
            new MetadataRequest(
                [new MetadataAssignmentInput(MetadataTargetType.Entity, modelTarget, term.Id, "retain")],
                "metadata-1",
                (string)version.Value!.GetType().GetProperty("ContentSha256")!.GetValue(version.Value)!),
            TestContext.CancellationToken);
        var metadataVersion = Assert.IsInstanceOfType<CreatedResult>(metadata);
        var metadataVersionId = (Guid)metadataVersion.Value!.GetType().GetProperty("Id")!.GetValue(metadataVersion.Value)!;
        var exported = Assert.IsInstanceOfType<OkObjectResult>(
            await api.Export(modelId, variantId, metadataVersionId, new ExportRequest("mssql"), TestContext.CancellationToken));
        var sidecar = (string)exported.Value!.GetType().GetProperty("sidecar")!.GetValue(exported.Value)!;
        Assert.Contains("test-vocabulary", sidecar);
        Assert.Contains("PROTECTED_B", sidecar);
        Assert.Contains("Protected B", sidecar);
        Assert.Contains("retain", sidecar);
        var afterMetadata = (OkObjectResult)await api.Versions(modelId, variantId, TestContext.CancellationToken);
        Assert.HasCount(2, (IEnumerable<object>)afterMetadata.Value!);
    }

    [TestMethod]
    public async Task ImportPreviewAndExactExportUseServerCanonicalPath()
    {
        var (_, api, _) = CreateApi();
        var preview = (OkObjectResult)await api.ImportPreview(
            new ImportRequest("orders.sql", "CREATE TABLE orders (id INTEGER PRIMARY KEY);"),
            TestContext.CancellationToken);
        Assert.IsTrue((bool)preview.Value!.GetType().GetProperty("supported")!.GetValue(preview.Value)!);
    }

    [TestMethod]
    public async Task ArtifactExportResolvesGovernedMetadataTerms()
    {
        var (db, api, _) = CreateApi();
        var vocabulary = new Vocabulary { Name = "Records governance", Version = 3 };
        var term = new VocabularyTerm { Code = "PROTECTED_C", Description = "Protected C" };
        vocabulary.Terms.Add(term);
        db.Vocabularies.Add(vocabulary);
        await db.SaveChangesAsync(TestContext.CancellationToken);
        var tableId = Guid.NewGuid();
        var snapshot = JsonSerializer.Serialize(new CanonicalSchema(
            [new SchemaTable("People", [new SchemaColumn("Sin", "string(9)")], tableId)],
            [new CanonicalMetadataAssignment(MetadataTargetType.Entity, tableId, term.Id, "destroy")]));

        var exported = Assert.IsInstanceOfType<OkObjectResult>(
            await api.ExportArtifact(new ExportArtifactRequest("mssql", snapshot), TestContext.CancellationToken));
        var sidecar = (string)exported.Value!.GetType().GetProperty("sidecar")!.GetValue(exported.Value)!;

        Assert.Contains("Records governance", sidecar);
        Assert.Contains("PROTECTED_C", sidecar);
        Assert.Contains("Protected C", sidecar);
        Assert.Contains("destroy", sidecar);
    }

    [TestMethod]
    public void MetadataTargetTypeUsesReadableStringJsonContract()
    {
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        options.Converters.Add(new JsonStringEnumConverter());
        foreach (var expected in Enum.GetValues<MetadataTargetType>())
        {
            var assignment = JsonSerializer.Deserialize<MetadataAssignmentInput>(
                "{\"targetType\":\"" + expected + "\",\"targetId\":\"00000000-0000-0000-0000-000000000001\",\"vocabularyTermId\":\"00000000-0000-0000-0000-000000000002\"}",
                options);
            Assert.IsNotNull(assignment);
            Assert.AreEqual(expected, assignment.TargetType);
        }
    }

    [TestMethod]
    public void DdlAndUnambiguousTextArtifactsAreSupported()
    {
        var ddl = SchemaImportService.Parse("schema.ddl", "CREATE TABLE orders (id INTEGER PRIMARY KEY);");
        Assert.IsNotNull(ddl.Schema);
        var text = SchemaImportService.Parse("schema.txt", "CREATE TABLE orders (id INTEGER PRIMARY KEY);");
        Assert.IsNotNull(text.Schema);
        var ambiguous = SchemaImportService.Parse("schema.txt", "not a schema");
        Assert.IsNull(ambiguous.Schema);
        Assert.AreEqual("unsupported-format", ambiguous.Diagnostics[0].Code);
    }

    [TestMethod]
    public async Task ImportPreviewReportsDetectedFormatForTextArtifacts()
    {
        var (_, api, _) = CreateApi();
        var ef = (OkObjectResult)await api.ImportPreview(
            new ImportRequest("schema.txt", "public class Order { public int Id { get; set; } }"),
            TestContext.CancellationToken);
        Assert.AreEqual("ef-core", ef.Value!.GetType().GetProperty("format")!.GetValue(ef.Value));

        var ddl = (OkObjectResult)await api.ImportPreview(
            new ImportRequest("schema.txt", "CREATE TABLE orders (id INTEGER);"),
            TestContext.CancellationToken);
        Assert.AreEqual("ddl", ddl.Value!.GetType().GetProperty("format")!.GetValue(ddl.Value));
    }
}
