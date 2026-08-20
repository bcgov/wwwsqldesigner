using System.Net;
using System.Net.Http.Headers;
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

        private sealed class TestApplicationFactory : WebApplicationFactory<Program>
        {
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
                        ["Authentication:Keycloak:ClientSecret"] = "secret"
                    });
                });
                builder.ConfigureTestServices(services =>
                {
                    services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                    services.RemoveAll<ApplicationDbContext>();
                    services.AddDbContext<ApplicationDbContext>(options =>
                        options.UseInMemoryDatabase(Guid.NewGuid().ToString()));

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
                var identity = new ClaimsIdentity(
                    new[] { new Claim(ClaimTypes.Name, "pipeline-test") },
                    "Test");
                return Task.FromResult(
                    AuthenticateResult.Success(new AuthenticationTicket(
                        new ClaimsPrincipal(identity),
                        "Test")));
            }
        }
    }
}
