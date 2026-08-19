using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Security.Claims;
using System.Text;
using WwwSqlDesigner.Authentication;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Controllers.Tests
{
    [TestClass()]
    public class WwwSqlControllerTests : TestBase
    {
        #region Initialization
        private readonly WwwSqlController _controller;

        public WwwSqlControllerTests() : base()
        {
            _controller = InitializeController();
        }

        private WwwSqlController InitializeController(KeycloakSettings? settings = null, ClaimsPrincipal? user = null)
        {
            var logger = InitializeLogger<WwwSqlController>();
            var controller = new WwwSqlController(logger, _dbContext, settings);
            controller.ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = user ?? new ClaimsPrincipal(new ClaimsIdentity())
                }
            };
            return controller;
        }

        private static DefaultHttpContext CreateHttpContextWithAntiforgery()
        {
            var httpContext = new DefaultHttpContext();
            var services = new ServiceCollection();
            services.AddSingleton<IAntiforgery, TestAntiforgery>();
            httpContext.RequestServices = services.BuildServiceProvider();
            httpContext.Request.Headers["X-CSRF-TOKEN"] = "request-token";
            return httpContext;
        }

        private static DefaultHttpContext CreateAuthenticatedHttpContext(string ownerId)
        {
            var httpContext = CreateHttpContextWithAntiforgery();
            httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, ownerId) },
                authenticationType: "Test"));
            return httpContext;
        }

        private sealed class TestAntiforgery : IAntiforgery
        {
            public AntiforgeryTokenSet GetAndStoreTokens(HttpContext httpContext)
                => new("request-token", "cookie-token", "__RequestVerificationToken", "X-CSRF-TOKEN");

            public AntiforgeryTokenSet? GetAndStoreTokens(HttpContext httpContext, AntiforgeryTokenSet? tokenSet)
                => tokenSet ?? new AntiforgeryTokenSet("request-token", "cookie-token", "__RequestVerificationToken", "X-CSRF-TOKEN");

            public Task<AntiforgeryTokenSet> GetAndStoreTokensAsync(HttpContext httpContext, AntiforgeryTokenSet? tokenSet, CancellationToken cancellationToken = default)
                => Task.FromResult(tokenSet ?? new AntiforgeryTokenSet("request-token", "cookie-token", "__RequestVerificationToken", "X-CSRF-TOKEN"));

            public AntiforgeryTokenSet GetTokens(HttpContext httpContext)
                => new("request-token", "cookie-token", "__RequestVerificationToken", "X-CSRF-TOKEN");

            public Task<AntiforgeryTokenSet> GetTokensAsync(HttpContext httpContext, CancellationToken cancellationToken = default)
                => Task.FromResult(new AntiforgeryTokenSet("request-token", "cookie-token", "__RequestVerificationToken", "X-CSRF-TOKEN"));

            public void SetCookieTokenAndHeader(HttpContext httpContext)
            {
            }

            public Task SetCookieTokenAndHeaderAsync(HttpContext httpContext)
                => Task.CompletedTask;

            public Task<bool> IsRequestValidAsync(HttpContext httpContext)
                => Task.FromResult(string.Equals(httpContext.Request.Headers["X-CSRF-TOKEN"], "request-token", StringComparison.Ordinal));

            public async Task ValidateRequestAsync(HttpContext httpContext)
            {
                if (!await IsRequestValidAsync(httpContext))
                {
                    throw new InvalidOperationException("Invalid antiforgery token.");
                }
            }
        }
        #endregion

        #region Init Test Data
        private const string FooBarModelXml = "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\r\n<sql>\r\n<datatypes db=\"mssql\">\r\n\t<group label=\"Integer\" color=\"rgb(238,238,170)\">\r\n\t\t<type label=\"TinyInt\" length=\"0\" sql=\"tinyint\" re=\"INT\" quote=\"\" bytes=\"1\" note=\"Integer data: 0 to 255\"/>\r\n\t\t<type label=\"SmallInt\" length=\"0\" sql=\"smallint\" re=\"INT\" quote=\"\" bytes=\"2\" note=\"Integer data: -32,768 to 32,767\"/>\r\n\t\t<type label=\"Int\" length=\"0\" sql=\"int\" re=\"INT\" quote=\"\" bytes=\"4\" note=\"Integer data: -2,147,483,648 to 2,147,483,647\"/>\r\n\t\t<type label=\"BigInt\" length=\"0\" sql=\"bigint\" re=\"INT\" quote=\"\" bytes=\"8\" note=\"Integer data: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Monetary\" color=\"rgb(238,238,170)\">\r\n\t\t<type label=\"Money\" length=\"0\" sql=\"money\" re=\"FLOAT\" quote=\"\" bytes=\"8\" note=\"Integer data: -922,337,203,685,477.5808 to 922,337,203,685,477.5807\"/>\r\n\t\t<type label=\"SmallMoney\" length=\"0\" sql=\"smallmoney\" re=\"FLOAT\" quote=\"\" bytes=\"4\" note=\"-214,748.3648 to 214,748.3647\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Numeric\" color=\"rgb(238,238,170)\">\r\n\t\t<type label=\"Real\" length=\"0\" sql=\"real\" re=\"FLOAT\" quote=\"\" bytes=\"4\" note=\"Floating precision number data: -3.402823E+38 to 3.402823E+38\"/>\r\n\t\t<type label=\"Float\" length=\"0\" sql=\"float\" re=\"FLOAT\" quote=\"\" bytes=\"8\" note=\"Floating precision number data: -4.94E+324 to 4.94E+324\"/>\r\n\t\t<type label=\"Decimal\" length=\"1\" sql=\"decimal\" re=\"DEC\" quote=\"\" bytes=\"n*\" note=\"Fixed precision and scale numeric data: -10^38 +1 to 10^38 -1 (decimal and numeric are synonyms)\"/>\r\n\t\t<type label=\"Numeric\" length=\"1\" sql=\"numeric\" re=\"DEC\" quote=\"\" bytes=\"n*\" note=\"Fixed precision and scale numeric data: -10^38 +1 to 10^38 -1 (decimal and numeric are synonyms)\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Character\" color=\"rgb(255,200,200)\">\r\n\t\t<type label=\"Char\" length=\"0\" sql=\"char\" quote=\"'\" bytes=\"n\" note=\"Fixed-length character data with a maximum length of 8,000 characters\"/>\r\n\t\t<type label=\"Varchar\" length=\"1\" sql=\"varchar\" quote=\"'\" bytes=\"m &lt;= n\" note=\"Variable-length data with a maximum of 8,000 characters\"/>\r\n\t\t<type label=\"Text\" length=\"1\" sql=\"text\" quote=\"'\" bytes=\"&lt;= 2,147,483,647\" note=\"Variable-length data with a maximum length of 2,147,483,647 characters\"/>\r\n\t\t<type label=\"XML\" length=\"0\" sql=\"xml\" quote=\"'\" bytes=\"n\" note=\"XML\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Unicode Character\" color=\"rgb(255,200,200)\">\r\n\t\t<type label=\"nChar\" length=\"0\" sql=\"nchar\" quote=\"'\" bytes=\"n\" note=\"Fixed-length Unicode data with a maximum length of 4,000 characters\"/>\r\n\t\t<type label=\"nVarchar\" length=\"1\" sql=\"nvarchar\" quote=\"'\" bytes=\"m &lt;= n\" note=\"Variable-length Unicode data with a maximum length of 4,000 characters\"/>\r\n\t\t<type label=\"nText\" length=\"1\" sql=\"ntext\" quote=\"'\" bytes=\"&lt;= 2,147,483,647\" note=\"Variable-length Unicode data with a maximum length of 1,073,741,823 characters\"/>\r\n\t</group>\r\n\r\n\r\n\t<group label=\"Date &amp; Time\" color=\"rgb(200,255,200)\">\r\n\t\t<type label=\"Datetime\" length=\"0\" sql=\"datetime2\" quote=\"\" bytes=\"8\" note=\"Jan 1, 1753 to Dec 31, 9999\"/>\r\n\t\t<type label=\"SmallDateTime\" length=\"0\" sql=\"smalldatetime\" quote=\"\" bytes=\"4\" note=\"Jan 1, 1900 to Dec 31, 2079\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Binary\" color=\"rgb(200,200,255)\">\r\n\t\t<type label=\"Binary\" length=\"0\" sql=\"binary\" quote=\"'\" bytes=\"n\" note=\"Fixed-length binary data with a maximum length of 8,000 bytes\"/>\r\n\t\t<type label=\"Varbinary\" length=\"1\" sql=\"varbinary\" quote=\"'\" bytes=\"m &lt;= n\" note=\"Variable-length binary data with a maximum length of 8,000 bytes\"/>\r\n\t</group>\r\n\r\n\t<group label=\"Miscellaneous\" color=\"rgb(200,220,255)\">\r\n\t\t<type label=\"Bit\" length=\"0\" sql=\"bit\" quote=\"\" bytes=\"1\" note=\"Boolean: 1 or 0\"/>\r\n\t\t<type label=\"Image\" length=\"1\" sql=\"image\" re=\"BLOB\" quote=\"\" bytes=\"0 to 2,147,483,647\" note=\"Variable-length binary data with a maximum length of 2,147,483,647 bytes\"/>\r\n\t\t<type label=\"Timestamp\" length=\"0\" sql=\"timestamp\" quote=\"\" bytes=\"8\" note=\"Locally unique binary number updated as a row gets updated\"/>\r\n\t\t<type label=\"SQL Variant\" length=\"1\" sql=\"sql_variant\" quote=\"\" bytes=\"\" note=\"Stores any datatype except text, ntext, image, timestamp\"/>\r\n\t\t<type label=\"Uniqueidentifier\" length=\"1\" sql=\"uniqueidentifier\" quote=\"\" bytes=\"16\" note=\"GUID\"/>\r\n\t</group>\r\n</datatypes><table x=\"489\" y=\"245\" name=\"Foo\">\r\n<row name=\"id\" null=\"1\" autoincrement=\"1\">\r\n<datatype>tinyint</datatype>\r\n<default>NULL</default></row>\r\n<key type=\"PRIMARY\" name=\"\">\r\n<part>id</part>\r\n</key>\r\n</table>\r\n<table x=\"1007\" y=\"249\" name=\"Bar\">\r\n<row name=\"id\" null=\"1\" autoincrement=\"1\">\r\n<datatype>tinyint</datatype>\r\n<default>NULL</default></row>\r\n<row name=\"id_Foo\" null=\"1\" autoincrement=\"0\">\r\n<datatype>tinyint</datatype>\r\n<default>NULL</default><relation table=\"Foo\" row=\"id\" />\r\n</row>\r\n<key type=\"PRIMARY\" name=\"\">\r\n<part>id</part>\r\n</key>\r\n</table>\r\n</sql>\r\n";

        [TestInitialize]
        public void SeedData()
        {
            _dbContext.DataModels.Add(new Data.DataModel()
            {
                CreatedAt = new DateTime(2023, 02, 12, 12, 23, 34),
                Keyword = "Test1",
                Data = FooBarModelXml,
                Version = 0,
            });
            _dbContext.DataModels.Add(new Data.DataModel()
            {
                CreatedAt = new DateTime(2023, 02, 14, 12, 23, 34),
                Keyword = "Test1",
                Data = FooBarModelXml,
                Version = 1,
            });
            _dbContext.DataModels.Add(new Data.DataModel()
            {
                CreatedAt = new DateTime(2023, 05, 15, 12, 23, 34),
                Keyword = "Test2",
                Data = FooBarModelXml,
                Version = 0,
            });
            _dbContext.SaveChanges();
        }
        #endregion

        #region Tests
        [TestMethod()]
        public async Task ListTest()
        {
            var result = await _controller.List().ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            string? content = ((ContentResult)result).Content;
            Assert.IsNotNull(content);
            StringAssert.Contains(content, "Test1");
            StringAssert.Contains(content, "Test2");
        }

        [TestMethod()]
        public async Task LoadTestNoKeyword()
        {
            var result = await _controller.Load(null, null).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod()]
        public async Task LoadTestInvalidKeyword()
        {
            var result = await _controller.Load("DoesNotExist", null).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod()]
        public async Task LoadTestInvalidVersion()
        {
            var result = await _controller.Load("Test1", 99).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod()]
        public async Task LoadTestLatest()
        {
            var result = await _controller.Load("Test1", null).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            string? content = ((ContentResult)result).Content;
            Assert.IsNotNull(content);
            Assert.AreEqual(content, FooBarModelXml);
        }

        [TestMethod()]
        public async Task LoadTestVersion()
        {
            var result = await _controller.Load("Test1", 1).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            string? content = ((ContentResult)result).Content;
            Assert.IsNotNull(content);
            Assert.AreEqual(content, FooBarModelXml);
        }

        [TestMethod]
        public async Task VersionsReturnsNewestFirstForKeyword()
        {
            var result = await _controller.Versions("Test1");

            var json = (JsonResult)result;
            var versions = (IEnumerable<ModelVersionResponse>)json.Value!;
            CollectionAssert.AreEqual(new[] { 1, 0 }, versions.Select(x => x.Version).ToArray());
        }

        [TestMethod]
        public async Task VersionsReturnsNotFoundForUnknownKeyword()
        {
            var result = await _controller.Versions("Missing");

            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod()]
        public async Task SaveTestNoKeyword()
        {
            _controller.ControllerContext = new ControllerContext
            {
                HttpContext = CreateHttpContextWithAntiforgery()
            };
            var result = await _controller.Save(null).ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod()]
        public async Task SaveTestNew()
        {
            var httpContext = CreateHttpContextWithAntiforgery();
            using MemoryStream stream = new(Encoding.UTF8.GetBytes(FooBarModelXml));
            httpContext.Request.Body = stream;
            httpContext.Request.ContentLength = stream.Length;
            _controller.ControllerContext = new ControllerContext()
            {
                HttpContext = httpContext
            };
            var result = await _controller.Save("Test3").ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            var dbContent = _dbContext.DataModels.FirstOrDefault(x => x.Keyword == "Test3");
            Assert.IsNotNull(dbContent);
        }

        [TestMethod()]
        public async Task SaveTestUpdate()
        {
            int oldVersion = _dbContext.DataModels.OrderByDescending(x => x.CreatedAt).First(x => x.Keyword == "Test1").Version;
            var httpContext = CreateHttpContextWithAntiforgery();
            using MemoryStream stream = new(Encoding.UTF8.GetBytes(FooBarModelXml));
            httpContext.Request.Body = stream;
            httpContext.Request.ContentLength = stream.Length;
            _controller.ControllerContext = new ControllerContext()
            {
                HttpContext = httpContext
            };
            var result = await _controller.Save("Test1").ConfigureAwait(true);
            Assert.IsInstanceOfType(result, typeof(ContentResult));
            var dbContent = _dbContext.DataModels.OrderByDescending(x => x.CreatedAt).FirstOrDefault(x => x.Keyword == "Test1");
            Assert.IsNotNull(dbContent);
            Assert.AreNotEqual(oldVersion, dbContent.Version);
        }

        [TestMethod()]
        public async Task ServerModelsAreScopedToOwner()
        {
            var settings = new KeycloakSettings
            {
                Enabled = true,
                Authority = "https://login.example/realms/standard",
                ClientId = "wwwsqldesigner",
                ClientSecret = "test-secret"
            };
            var ownerA = new WwwSqlController(InitializeLogger<WwwSqlController>(), _dbContext, settings);
            var ownerB = new WwwSqlController(InitializeLogger<WwwSqlController>(), _dbContext, settings);

            var ownerAContext = CreateAuthenticatedHttpContext("owner-a");
            using var ownerAStream = new MemoryStream(Encoding.UTF8.GetBytes(FooBarModelXml));
            ownerAContext.Request.Body = ownerAStream;
            ownerA.ControllerContext = new ControllerContext { HttpContext = ownerAContext };
            await ownerA.Save("SharedKeyword").ConfigureAwait(true);

            var ownerBContext = CreateAuthenticatedHttpContext("owner-b");
            using var ownerBStream = new MemoryStream(Encoding.UTF8.GetBytes(FooBarModelXml));
            ownerBContext.Request.Body = ownerBStream;
            ownerB.ControllerContext = new ControllerContext { HttpContext = ownerBContext };
            await ownerB.Save("SharedKeyword").ConfigureAwait(true);

            var ownerAResult = await ownerA.Load("SharedKeyword", null).ConfigureAwait(true);
            var ownerBResult = await ownerB.Load("SharedKeyword", null).ConfigureAwait(true);
            var ownerOnlyContext = CreateAuthenticatedHttpContext("owner-a");
            using var ownerOnlyStream = new MemoryStream(Encoding.UTF8.GetBytes(FooBarModelXml));
            ownerOnlyContext.Request.Body = ownerOnlyStream;
            ownerA.ControllerContext = new ControllerContext { HttpContext = ownerOnlyContext };
            await ownerA.Save("OwnerOnlyKeyword").ConfigureAwait(true);
            var ownerOnlyList = await ownerA.List().ConfigureAwait(true);
            var missingForOtherOwner = await ownerB.Load("OwnerOnlyKeyword", null).ConfigureAwait(true);
            var ownerBList = await ownerB.List().ConfigureAwait(true);

            Assert.IsInstanceOfType(ownerAResult, typeof(ContentResult));
            Assert.IsInstanceOfType(ownerBResult, typeof(ContentResult));
            Assert.AreEqual(2, _dbContext.DataModels.Count(x => x.Keyword == "SharedKeyword"));
            StringAssert.Contains(((ContentResult)ownerOnlyList).Content, "OwnerOnlyKeyword");
            Assert.IsInstanceOfType(missingForOtherOwner, typeof(NotFoundResult));
            Assert.IsFalse(((ContentResult)ownerBList).Content!.Contains("OwnerOnlyKeyword", StringComparison.Ordinal));
        }

        [TestMethod]
        public async Task ListIncludesDirectAndGroupSharesButNotPrivateModels()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.AddRange(
                new DataModel { OwnerId = "alice", Keyword = "Owned", Version = 0, Data = FooBarModelXml, CreatedAt = DateTime.UtcNow },
                new DataModel { OwnerId = "bob", Keyword = "Private", Version = 0, Data = FooBarModelXml, CreatedAt = DateTime.UtcNow },
                new DataModel { OwnerId = "bob", Keyword = "UserShared", Version = 0, Data = FooBarModelXml, CreatedAt = DateTime.UtcNow },
                new DataModel { OwnerId = "bob", Keyword = "GroupShared", Version = 0, Data = FooBarModelXml, CreatedAt = DateTime.UtcNow });
            _dbContext.DataModelAccessGrants.AddRange(
                new DataModelAccessGrant { OwnerId = "bob", Keyword = "UserShared", TargetType = "User", TargetId = "alice", Permission = "View" },
                new DataModelAccessGrant { OwnerId = "bob", Keyword = "GroupShared", TargetType = "Group", TargetId = "team-a", Permission = "View" });
            _dbContext.SaveChanges();

            var controller = InitializeController(settings, User("alice", "team-a"));
            var result = (ContentResult)await controller.List();

            StringAssert.Contains(result.Content, "Owned");
            StringAssert.Contains(result.Content, "UserShared");
            StringAssert.Contains(result.Content, "GroupShared");
            Assert.IsFalse(result.Content!.Contains("Private", StringComparison.Ordinal));
        }

        [TestMethod]
        public async Task AuthenticatedUsersCanLoadUnownedModels()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.Add(new DataModel
            {
                OwnerId = DataModel.UnownedOwnerId,
                Keyword = "PublicLegacy",
                Version = 0,
                Data = FooBarModelXml
            });
            _dbContext.SaveChanges();

            var controller = InitializeController(settings, User("viewer"));
            var result = await controller.Load("PublicLegacy", null);

            Assert.IsInstanceOfType(result, typeof(ContentResult));
            Assert.AreEqual("true", controller.Response.Headers["X-MODEL-COPYABLE"].ToString());
        }

        [TestMethod]
        public async Task ListEncodesOwnerIdInModelLinks()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.Add(new DataModel
            {
                OwnerId = "owner&team",
                Keyword = "Shared model",
                Version = 0,
                Data = FooBarModelXml
            });
            _dbContext.SaveChanges();

            var controller = InitializeController(settings, User("owner&team"));
            var result = (ContentResult)await controller.List();

            StringAssert.Contains(result.Content, "keyword=Shared%20model");
            StringAssert.Contains(result.Content, "ownerId=owner%26team");
            Assert.IsFalse(result.Content!.Contains("ownerId=owner&team", StringComparison.Ordinal));
        }

        [TestMethod]
        public async Task OwnerCanManageViewGrantButOtherUsersCannot()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.Add(new DataModel
            {
                OwnerId = "owner",
                Keyword = "Shared",
                Version = 0,
                Data = FooBarModelXml,
                CreatedAt = DateTime.UtcNow
            });
            _dbContext.SaveChanges();

            var owner = InitializeController(settings, User("owner"));
            Assert.IsInstanceOfType(
                await owner.GrantAccess("Shared", new AccessGrantRequest("Group", "team-a", "View")),
                typeof(NoContentResult));

            var grants = (JsonResult)await owner.Access("Shared");
            var values = (IEnumerable<AccessGrantResponse>)grants.Value!;
            Assert.AreEqual("team-a", values.Single().TargetId);

            var other = InitializeController(settings, User("other"));
            Assert.IsInstanceOfType(await other.Access("Shared"), typeof(NotFoundResult));
            Assert.IsInstanceOfType(
                await other.GrantAccess("Shared", new AccessGrantRequest("User", "other", "View")),
                typeof(NotFoundResult));
            Assert.IsInstanceOfType(await owner.RevokeAccess("Shared", "Group", "team-a"), typeof(NoContentResult));
        }

        [TestMethod]
        public async Task SharedViewerCanLoadAndSaveOwnCopy()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.Add(new DataModel
            {
                OwnerId = "owner",
                Keyword = "Shared",
                Version = 0,
                Data = FooBarModelXml,
                CreatedAt = DateTime.UtcNow
            });
            _dbContext.DataModelAccessGrants.Add(new DataModelAccessGrant
            {
                OwnerId = "owner",
                Keyword = "Shared",
                TargetType = "User",
                TargetId = "viewer",
                Permission = "View"
            });
            _dbContext.SaveChanges();

            var viewer = InitializeController(settings, User("viewer"));
            Assert.IsInstanceOfType(await viewer.Load("Shared", null), typeof(ContentResult));
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(FooBarModelXml));
            viewer.HttpContext.Request.Body = stream;
            viewer.HttpContext.Request.ContentLength = stream.Length;
            var saveResult = await viewer.Save("Shared");
            Assert.IsInstanceOfType(saveResult, typeof(ContentResult));
            Assert.AreEqual(1, _dbContext.DataModels.Count(x => x.OwnerId == "owner" && x.Keyword == "Shared"));
            Assert.AreEqual(1, _dbContext.DataModels.Count(x => x.OwnerId == "viewer" && x.Keyword == "Shared"));
        }

        [TestMethod]
        public async Task SharedModelsWithSameKeywordCanBeSelectedByOwner()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.AddRange(
                new DataModel { OwnerId = "owner-a", Keyword = "Shared", Version = 0, Data = "<sql><table name=\"A\" /></sql>", CreatedAt = DateTime.UtcNow },
                new DataModel { OwnerId = "owner-b", Keyword = "Shared", Version = 0, Data = "<sql><table name=\"B\" /></sql>", CreatedAt = DateTime.UtcNow });
            _dbContext.DataModelAccessGrants.Add(new DataModelAccessGrant
            {
                OwnerId = "owner-b",
                Keyword = "Shared",
                TargetType = "User",
                TargetId = "viewer",
                Permission = "View"
            });
            _dbContext.SaveChanges();

            var viewer = InitializeController(settings, User("viewer"));
            var result = await viewer.Load("Shared", null, "owner-b");

            var content = (ContentResult)result;
            StringAssert.Contains(content.Content, "name=\"B\"");
            Assert.AreEqual("true", viewer.Response.Headers["X-MODEL-COPYABLE"].ToString());
        }

        [TestMethod]
        public async Task RoleClaimDoesNotGrantGroupAccess()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.Add(new DataModel
            {
                OwnerId = "owner",
                Keyword = "RoleOnly",
                Version = 0,
                Data = FooBarModelXml
            });
            _dbContext.DataModelAccessGrants.Add(new DataModelAccessGrant
            {
                OwnerId = "owner",
                Keyword = "RoleOnly",
                TargetType = "Group",
                TargetId = "team-a",
                Permission = "View"
            });
            _dbContext.SaveChanges();

            var roleOnlyUser = new ClaimsPrincipal(new ClaimsIdentity(
                new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, "viewer"),
                    new Claim(ClaimTypes.Role, "team-a")
                },
                "Test"));

            var result = await InitializeController(settings, roleOnlyUser).Load("RoleOnly", null);

            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod]
        public async Task ConfiguredUserWithoutStableIdentityCannotLoadModels()
        {
            var settings = ConfiguredKeycloak();
            var user = new ClaimsPrincipal(new ClaimsIdentity("Test"));

            await Assert.ThrowsExceptionAsync<InvalidOperationException>(
                () => InitializeController(settings, user).Load("Missing", null));
        }

        [TestMethod]
        public async Task EditPermissionIsRejected()
        {
            var settings = ConfiguredKeycloak();
            _dbContext.DataModels.Add(new DataModel
            {
                OwnerId = "owner",
                Keyword = "Shared",
                Version = 0,
                Data = FooBarModelXml
            });
            _dbContext.SaveChanges();

            var owner = InitializeController(settings, User("owner"));
            var result = await owner.GrantAccess(
                "Shared",
                new AccessGrantRequest("User", "viewer", "Edit"));

            Assert.IsInstanceOfType(result, typeof(BadRequestObjectResult));
        }

        private static KeycloakSettings ConfiguredKeycloak()
        {
            return new KeycloakSettings
            {
                Enabled = true,
                Authority = "https://login.example/realms/standard",
                ClientId = "wwwsqldesigner",
                ClientSecret = "test-secret"
            };
        }

        private static ClaimsPrincipal User(string subject, params string[] groups)
        {
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, subject) };
            claims.AddRange(groups.Select(group => new Claim("groups", group)));
            return new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
        }

        [TestMethod()]
        public void ImportTest()
        {
            var result = _controller.Import();
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }
        #endregion
    }
}