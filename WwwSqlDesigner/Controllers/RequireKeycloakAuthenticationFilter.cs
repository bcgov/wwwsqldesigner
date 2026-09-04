using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using WwwSqlDesigner.Authentication;

namespace WwwSqlDesigner.Controllers
{
    public class RequireKeycloakAuthenticationFilter : IAsyncAuthorizationFilter
    {
        private readonly KeycloakSettings _keycloakSettings;

        public RequireKeycloakAuthenticationFilter(KeycloakSettings keycloakSettings)
        {
            _keycloakSettings = keycloakSettings;
        }

        public Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            if (!_keycloakSettings.IsConfigured)
            {
                return Task.CompletedTask;
            }

            if (context.HttpContext.User.Identity?.IsAuthenticated == true)
            {
                return Task.CompletedTask;
            }

            context.Result = new UnauthorizedResult();
            return Task.CompletedTask;
        }
    }
}
