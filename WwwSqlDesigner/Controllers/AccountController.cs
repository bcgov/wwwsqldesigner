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
        public async Task<IActionResult> Logout(string? returnUrl = null)
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

            if (_keycloakSettings.IsConfigured)
            {
                await HttpContext.SignOutAsync(OpenIdConnectDefaults.AuthenticationScheme);
            }

            return LocalRedirect(GetSafeReturnUrl(returnUrl));
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
    }
}
