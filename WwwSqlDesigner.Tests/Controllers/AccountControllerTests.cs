using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Security.Claims;
using WwwSqlDesigner.Authentication;

namespace WwwSqlDesigner.Controllers.Tests
{
    [TestClass]
    public class AccountControllerTests
    {
        [TestMethod]
        public void KeycloakValidationRejectsMissingProductionConfiguration()
        {
            var settings = new KeycloakSettings();

            var exception = Assert.Throws<InvalidOperationException>(
                () => settings.Validate(isDevelopment: false));

            Assert.Contains("outside the Development environment", exception.Message);
        }

        [TestMethod]
        public void KeycloakValidationRejectsMissingConfidentialClientSecret()
        {
            var settings = new KeycloakSettings
            {
                Enabled = true,
                Authority = "https://example.test/realms/test",
                ClientId = "client"
            };

            var exception = Assert.Throws<InvalidOperationException>(
                () => settings.Validate(isDevelopment: true));

            Assert.Contains("ClientSecret", exception.Message);
        }

        [TestMethod]
        public void AuthenticationErrorReturnsBadGatewayWithoutChallenge()
        {
            var controller = new AccountController(new KeycloakSettings
            {
                Enabled = true,
                Authority = "https://example.test/realms/test",
                ClientId = "client",
                ClientSecret = "secret"
            });

            var result = controller.AuthenticationError();

            var statusResult = result as ObjectResult;
            Assert.IsNotNull(statusResult);
            Assert.AreEqual(StatusCodes.Status502BadGateway, statusResult.StatusCode);
            Assert.Contains("/account/login", statusResult.Value?.ToString() ?? string.Empty);
        }

        [TestMethod]
        public void LogoutUsesCookieAndOpenIdConnectWhenKeycloakIsConfigured()
        {
            var controller = new AccountController(new KeycloakSettings
            {
                Enabled = true,
                Authority = "https://example.test/realms/test",
                ClientId = "client",
                ClientSecret = "secret"
            });

            var result = controller.Logout() as SignOutResult;

            Assert.IsNotNull(result);
            Assert.AreSequenceEqual(
                new[]
                {
                    "Cookies",
                    OpenIdConnectDefaults.AuthenticationScheme
                }, result.AuthenticationSchemes.ToArray(), Microsoft.VisualStudio.TestTools.UnitTesting.SequenceOrder.InAnyOrder);
            Assert.AreEqual("/", result.Properties?.RedirectUri);
        }

        [TestMethod]
        public void LogoutUsesOnlyCookieWhenKeycloakIsDisabled()
        {
            var controller = new AccountController(new KeycloakSettings());

            var result = controller.Logout() as SignOutResult;

            Assert.IsNotNull(result);
            Assert.AreSequenceEqual(
                new[] { CookieAuthenticationDefaults.AuthenticationScheme }, result.AuthenticationSchemes.ToArray());
            Assert.AreEqual("/", result.Properties?.RedirectUri);
        }

        [TestMethod]
        public void StatusDoesNotOfferSignOutWhenKeycloakIsDisabled()
        {
            var controller = new AccountController(new KeycloakSettings())
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext
                    {
                        User = new ClaimsPrincipal(new ClaimsIdentity("Test"))
                    }
                }
            };

            var result = controller.Status() as OkObjectResult;

            Assert.IsNotNull(result);
            var status = result.Value as AuthStatusResponse;
            Assert.IsNotNull(status);
            Assert.IsFalse(status.Enabled);
            Assert.IsFalse(status.Authenticated);
        }

    }
}
