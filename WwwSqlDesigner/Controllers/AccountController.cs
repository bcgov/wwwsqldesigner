using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WwwSqlDesigner.Authentication;

namespace WwwSqlDesigner.Controllers
{
    [Route("account")]
    public class AccountController : Controller
    {
        private readonly KeycloakSettings _keycloakSettings;

        public AccountController(KeycloakSettings keycloakSettings)
        {
            _keycloakSettings = keycloakSettings;
        }

        [AllowAnonymous]
        [HttpGet("login")]
        public IActionResult Login(string? returnUrl = null)
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return LocalRedirect(GetSafeReturnUrl(returnUrl));
            }

            var properties = new AuthenticationProperties
            {
                RedirectUri = GetSafeReturnUrl(returnUrl)
            };

            return Challenge(properties, OpenIdConnectDefaults.AuthenticationScheme);
        }

        [AllowAnonymous]
        [HttpGet("logout")]
        public IActionResult Logout(string? returnUrl = null)
        {
            var safeReturnUrl = GetSafeReturnUrl(returnUrl);
            if (!_keycloakSettings.IsConfigured)
            {
                return SignOut(
                    new AuthenticationProperties { RedirectUri = safeReturnUrl },
                    CookieAuthenticationDefaults.AuthenticationScheme);
            }

            return SignOut(
                new AuthenticationProperties { RedirectUri = safeReturnUrl },
                CookieAuthenticationDefaults.AuthenticationScheme,
                OpenIdConnectDefaults.AuthenticationScheme);
        }

        private string GetSafeReturnUrl(string? returnUrl)
        {
            if (string.IsNullOrWhiteSpace(returnUrl))
            {
                return "/";
            }

            return Url.IsLocalUrl(returnUrl) ? returnUrl : "/";
        }

        [AllowAnonymous]
        [HttpGet("access-denied")]
        public IActionResult AccessDenied()
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Access denied.");
        }

        [AllowAnonymous]
        [HttpGet("authentication-error")]
        public IActionResult AuthenticationError()
        {
            return StatusCode(
                StatusCodes.Status502BadGateway,
                "Authentication failed. Please retry by visiting /account/login.");
        }
    }
}
