using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using WwwSqlDesigner.Data;

namespace WwwSqlDesigner.Controllers.Tests
{
    [TestClass]
    public class WwwSqlControllerPipelineTests
    {
        [TestMethod]
        public async Task AuthenticatedUserGetsSignOutAvailabilityAndAntiforgeryToken()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            var response = await client.GetAsync("/account/status");

            response.EnsureSuccessStatusCode();
            Assert.IsTrue(await response.Content.ReadFromJsonAsync<bool>());
            Assert.IsTrue(response.Headers.TryGetValues("X-CSRF-TOKEN", out var tokens));
            Assert.IsFalse(string.IsNullOrWhiteSpace(tokens.Single()));
        }

        [TestMethod]
        public async Task AnonymousUserDoesNotGetSignOutAvailability()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });
            using var request = new HttpRequestMessage(HttpMethod.Get, "/account/status");
            request.Headers.Add("X-Test-Anonymous", "true");

            var response = await client.SendAsync(request);

            response.EnsureSuccessStatusCode();
            Assert.IsFalse(await response.Content.ReadFromJsonAsync<bool>());
        }

        [TestMethod]
        public async Task SignedOutAppShellLoadsOnceBeforeTheNextRefreshChallenges()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });
            using var request = new HttpRequestMessage(HttpMethod.Get, "/?signedOut=1");
            request.Headers.Add("X-Test-Anonymous", "true");

            var response = await client.SendAsync(request);

            response.EnsureSuccessStatusCode();
            StringAssert.Contains(await response.Content.ReadAsStringAsync(), "WWW SQL Designer");
        }

        [TestMethod]
        public async Task LogoutWithoutAntiforgeryTokenReturnsBadRequest()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["returnUrl"] = "/"
            });
            var response = await client.PostAsync("/account/logout", content);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task SaveWithoutAntiforgeryTokenReturnsBadRequest()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            using var content = new StringContent("<sql />");
            content.Headers.ContentType = new MediaTypeHeaderValue("application/xml");
            var response = await client.PostAsync(
                "/backend/netcore-ef/save?keyword=pipeline-test",
                content);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task SaveWithInvalidAntiforgeryTokenReturnsBadRequest()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            using var content = new StringContent("<sql />");
            content.Headers.ContentType = new MediaTypeHeaderValue("application/xml");
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                "/backend/netcore-ef/save?keyword=pipeline-test")
            {
                Content = content
            };
            request.Headers.Add("X-CSRF-TOKEN", "invalid-token");

            var response = await client.SendAsync(request);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task SaveWithValidAntiforgeryTokenIsAllowed()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            var tokenResponse = await client.GetAsync("/backend/netcore-ef/csrf");
            tokenResponse.EnsureSuccessStatusCode();
            var token = tokenResponse.Headers.GetValues("X-CSRF-TOKEN").Single();

            using var content = new StringContent("<sql />");
            content.Headers.ContentType = new MediaTypeHeaderValue("application/xml");
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                "/backend/netcore-ef/save?keyword=pipeline-test")
            {
                Content = content
            };
            request.Headers.Add("X-CSRF-TOKEN", token);

            var response = await client.SendAsync(request);

            Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        }

        [TestMethod]
        public async Task GrantWithoutAntiforgeryTokenReturnsBadRequest()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                "/backend/netcore-ef/access/grant?keyword=pipeline-test")
            {
                Content = JsonContent.Create(new { targetType = "User", targetId = "target", permission = "View" })
            };

            var response = await client.SendAsync(request);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task RevokeWithoutAntiforgeryTokenReturnsBadRequest()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });

            var response = await client.DeleteAsync(
                "/backend/netcore-ef/access/grant?keyword=pipeline-test&targetType=User&targetId=target");

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task GrantAndRevokeWithValidAntiforgeryTokenAreAllowed()
        {
            using var factory = new TestApplicationFactory();
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false
            });
            var tokenResponse = await client.GetAsync("/backend/netcore-ef/csrf");
            tokenResponse.EnsureSuccessStatusCode();
            var token = tokenResponse.Headers.GetValues("X-CSRF-TOKEN").Single();

            using var saveContent = new StringContent("<sql />");
            saveContent.Headers.ContentType = new MediaTypeHeaderValue("application/xml");
            using var saveRequest = new HttpRequestMessage(
                HttpMethod.Post,
                "/backend/netcore-ef/save?keyword=pipeline-test")
            {
                Content = saveContent
            };
            saveRequest.Headers.Add("X-CSRF-TOKEN", token);
            var saveResponse = await client.SendAsync(saveRequest);
            Assert.AreEqual(HttpStatusCode.OK, saveResponse.StatusCode);

            using var grantRequest = new HttpRequestMessage(
                HttpMethod.Post,
                "/backend/netcore-ef/access/grant?keyword=pipeline-test")
            {
                Content = JsonContent.Create(new { targetType = "User", targetId = "target", permission = "View" })
            };
            grantRequest.Headers.Add("X-CSRF-TOKEN", token);
            var grantResponse = await client.SendAsync(grantRequest);
            Assert.AreEqual(HttpStatusCode.NoContent, grantResponse.StatusCode);

            using var revokeRequest = new HttpRequestMessage(
                HttpMethod.Delete,
                "/backend/netcore-ef/access/grant?keyword=pipeline-test&targetType=User&targetId=target");
            revokeRequest.Headers.Add("X-CSRF-TOKEN", token);
            var revokeResponse = await client.SendAsync(revokeRequest);
            Assert.AreEqual(HttpStatusCode.NoContent, revokeResponse.StatusCode);
        }

        private sealed class TestApplicationFactory : WebApplicationFactory<Program>
        {
            private readonly string _databaseName = $"WwwSqlControllerPipelineTests-{Guid.NewGuid()}";

            protected override void ConfigureWebHost(IWebHostBuilder builder)
            {
                builder.UseEnvironment("Testing");
                builder.UseSetting("Authentication:Keycloak:Enabled", "true");
                builder.UseSetting("Authentication:Keycloak:Authority", "https://example.test/realms/test");
                builder.UseSetting("Authentication:Keycloak:ClientId", "client");
                builder.UseSetting("Authentication:Keycloak:ClientSecret", "secret");
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.Sources.Clear();
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Authentication:Keycloak:Enabled"] = "true",
                        ["Authentication:Keycloak:Authority"] = "https://example.test/realms/test",
                        ["Authentication:Keycloak:ClientId"] = "client",
                        ["Authentication:Keycloak:ClientSecret"] = "secret",
                    });
                });
                builder.ConfigureTestServices(services =>
                {
                    services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                    services.RemoveAll<ApplicationDbContext>();
                    services.AddDbContext<ApplicationDbContext>(options =>
                        options.UseInMemoryDatabase(_databaseName));

                    services.AddAuthentication(options =>
                    {
                        options.DefaultAuthenticateScheme = "Test";
                        options.DefaultChallengeScheme = "Test";
                    }).AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(
                        "Test",
                        _ => { });
                });
            }
        }

        private sealed class TestAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
        {
            public TestAuthenticationHandler(
                Microsoft.Extensions.Options.IOptionsMonitor<AuthenticationSchemeOptions> options,
                Microsoft.Extensions.Logging.ILoggerFactory logger,
                System.Text.Encodings.Web.UrlEncoder encoder,
                ISystemClock clock)
                : base(options, logger, encoder, clock)
            {
            }

            protected override Task<AuthenticateResult> HandleAuthenticateAsync()
            {
                if (Request.Headers.ContainsKey("X-Test-Anonymous"))
                {
                    return Task.FromResult(AuthenticateResult.NoResult());
                }

                var identity = new ClaimsIdentity(
                    new[]
                    {
                        new Claim(ClaimTypes.Name, "pipeline-test"),
                        new Claim(ClaimTypes.NameIdentifier, "pipeline-test")
                    },
                    "Test");
                return Task.FromResult(
                    AuthenticateResult.Success(new AuthenticationTicket(
                        new ClaimsPrincipal(identity),
                        "Test")));
            }
        }

    }
}
