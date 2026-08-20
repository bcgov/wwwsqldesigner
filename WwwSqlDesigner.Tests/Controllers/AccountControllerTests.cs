using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.VisualStudio.TestTools.UnitTesting;
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

            var exception = Assert.ThrowsException<InvalidOperationException>(
                () => settings.Validate(isDevelopment: false));

            StringAssert.Contains(exception.Message, "outside the Development environment");
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
            StringAssert.Contains(statusResult.Value?.ToString(), "/account/login");
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
            CollectionAssert.AreEquivalent(
                new[]
                {
                    "Cookies",
                    OpenIdConnectDefaults.AuthenticationScheme
                },
                result.AuthenticationSchemes.ToArray());
            Assert.AreEqual("/", result.Properties?.RedirectUri);
        }

    }
}
