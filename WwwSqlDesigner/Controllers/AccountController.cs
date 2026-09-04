using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using WwwSqlDesigner.Authentication;

namespace WwwSqlDesigner.Controllers
{
    public sealed record AuthStatusResponse(bool Authenticated, string? User);

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
        [HttpGet("status")]
        public IActionResult Status()
        {
            var authenticated = _keycloakSettings.IsConfigured
                && User.Identity?.IsAuthenticated == true;
            return Ok(new AuthStatusResponse(
                authenticated,
                authenticated ? GetUserDisplayName() : null));
        }

        [AllowAnonymous]
        [HttpPost("logout")]
        [ValidateAntiForgeryToken]
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

        private string? GetUserDisplayName()
        {
            var name = User.FindFirst("name")?.Value;
            if (!string.IsNullOrWhiteSpace(name))
            {
                return name;
            }

            var givenName = User.FindFirst("given_name")?.Value;
            var familyName = User.FindFirst("family_name")?.Value;
            var fullName = $"{givenName} {familyName}".Trim();
            return !string.IsNullOrWhiteSpace(fullName)
                ? fullName
                : User.FindFirst(ClaimTypes.Email)?.Value ?? User.Identity?.Name;
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
