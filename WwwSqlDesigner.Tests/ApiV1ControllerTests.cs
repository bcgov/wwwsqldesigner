using System.Security.Claims;
using System.Reflection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
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

    private static (ApplicationDbContext Db, CookieApiV1Controller Api, PatTokenService Tokens) CreateApi(
        string owner = "owner")
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new ApplicationDbContext(options);
        var tokens = new PatTokenService(db);
        var api = new CookieApiV1Controller(db, tokens, new SchemaExportService());
        var context = new DefaultHttpContext();
        context.Request.Method = HttpMethods.Post;
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, owner)], "cookie"));
        api.ControllerContext = new ControllerContext { HttpContext = context };
        return (db, api, tokens);
    }

    private static PatApiV1Controller CreatePatApi(
        ApplicationDbContext db,
        PatTokenService tokens,
        string? bearer,
        string? cookieOwner = null)
    {
        var api = new PatApiV1Controller(db, tokens, new SchemaExportService());
        var context = new DefaultHttpContext
        {
            User = string.IsNullOrWhiteSpace(cookieOwner)
                ? new ClaimsPrincipal()
                : new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.Name, cookieOwner)],
                    "cookie"))
        };
        context.Request.Method = HttpMethods.Post;
        if (bearer is not null) context.Request.Headers.Authorization = $"Bearer {bearer}";
        api.ControllerContext = new ControllerContext { HttpContext = context };
        return api;
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
    public async Task CookieAndPatControllersRejectTheOtherAuthenticationBoundary()
    {
        var (db, cookieApi, tokens) = CreateApi(owner: "");
        var pat = await tokens.CreateAsync("owner", [PatScopes.ApplicationsCreate], TimeSpan.FromDays(7), "automation", TestContext.CancellationToken);
        cookieApi.HttpContext.Request.Headers.Authorization = $"Bearer {pat.Plaintext}";
        Assert.IsInstanceOfType<UnauthorizedResult>(
            await cookieApi.CreateApplication(
                new ApplicationRequest("not-cookie-authorized", null, null),
                TestContext.CancellationToken));

        var cookieOnlyPatApi = CreatePatApi(db, tokens, null, "owner");
        Assert.IsInstanceOfType<UnauthorizedResult>(
            await cookieOnlyPatApi.CreateApplication(
                new ApplicationRequest("not-pat-authorized", null, null),
                TestContext.CancellationToken));

        var bearerApi = CreatePatApi(db, tokens, pat.Plaintext);
        var created = await bearerApi.CreateApplication(
            new ApplicationRequest("allowed", null, null),
            TestContext.CancellationToken);
        Assert.IsInstanceOfType<CreatedAtActionResult>(created);

        var malformedApi = CreatePatApi(db, tokens, "not-a-token");
        Assert.IsInstanceOfType<ForbidResult>(
            await malformedApi.CreateApplication(
                new ApplicationRequest("not-allowed", null, null),
                TestContext.CancellationToken));
    }

    [TestMethod]
    [DoNotParallelize]
    public async Task CookieWritesUseGlobalAntiforgeryAndPatRoutesExplicitlyOptOut()
    {
        Assert.IsNull(typeof(CookieApiV1Controller).GetCustomAttribute<IgnoreAntiforgeryTokenAttribute>());
        Assert.IsNotNull(typeof(PatApiV1Controller).GetCustomAttribute<IgnoreAntiforgeryTokenAttribute>());
        Assert.AreEqual(
            "api/ui/v1",
            typeof(CookieApiV1Controller).GetCustomAttribute<RouteAttribute>()!.Template);
        Assert.AreEqual(
            "api/v1",
            typeof(PatApiV1Controller).GetCustomAttribute<RouteAttribute>()!.Template);

        using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("Authentication:Keycloak:Enabled", "true");
                builder.UseSetting("Authentication:Keycloak:Authority", "https://example.test/realms/test");
                builder.UseSetting("Authentication:Keycloak:ClientId", "client");
                builder.UseSetting("Authentication:Keycloak:ClientSecret", "secret");
                builder.UseSetting(
                    "ConnectionStrings:DefaultConnection",
                    "Server=(localdb)\\MSSQLLocalDB;Database=WwwSqlDesignerTests;Integrated Security=True");
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.Sources.Clear();
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Authentication:Keycloak:Enabled"] = "true",
                        ["Authentication:Keycloak:Authority"] = "https://example.test/realms/test",
                        ["Authentication:Keycloak:ClientId"] = "client",
                        ["Authentication:Keycloak:ClientSecret"] = "secret",
                        ["ConnectionStrings:DefaultConnection"] =
                            "Server=(localdb)\\MSSQLLocalDB;Database=WwwSqlDesignerTests;Integrated Security=True"
                    });
                });
            });
        var filters = factory.Services.GetRequiredService<IOptions<MvcOptions>>().Value.Filters;
        Assert.Contains(filter => filter is AutoValidateAntiforgeryTokenAttribute, filters);

        var actions = factory.Services
            .GetRequiredService<IActionDescriptorCollectionProvider>()
            .ActionDescriptors.Items
            .OfType<ControllerActionDescriptor>()
            .ToArray();
        Assert.IsNotNull(actions.SingleOrDefault(action =>
            action.ControllerTypeInfo.AsType() == typeof(CookieApiV1Controller)
            && action.ActionName == nameof(CookieApiV1Controller.CreateToken)));
        Assert.IsNull(actions.SingleOrDefault(action =>
            action.ControllerTypeInfo.AsType() == typeof(PatApiV1Controller)
            && action.ActionName == nameof(CookieApiV1Controller.CreateToken)));
        Assert.IsNotNull(actions.SingleOrDefault(action =>
            action.ControllerTypeInfo.AsType() == typeof(CookieApiV1Controller)
            && action.ActionName == nameof(CookieApiV1Controller.CreateApplication)));
        Assert.IsNotNull(actions.SingleOrDefault(action =>
            action.ControllerTypeInfo.AsType() == typeof(PatApiV1Controller)
            && action.ActionName == nameof(PatApiV1Controller.CreateApplication)));

        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });
        var request = new ApplicationRequest("boundary-test", null, null);
        var cookieResponse = await client.PostAsJsonAsync(
            "/api/ui/v1/applications",
            request,
            TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.BadRequest, cookieResponse.StatusCode);
        var patResponse = await client.PostAsJsonAsync(
            "/api/v1/applications",
            request,
            TestContext.CancellationToken);
        Assert.AreEqual(HttpStatusCode.Unauthorized, patResponse.StatusCode);
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
