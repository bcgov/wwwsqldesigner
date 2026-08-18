using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using WwwSqlDesigner.Authentication;
using WwwSqlDesigner.Controllers;
using WwwSqlDesigner.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(connectionString));
builder.Services.AddDatabaseDeveloperPageExceptionFilter();
builder.Services.AddControllersWithViews();
builder.Services.AddAuthorization();
builder.Services.AddScoped<RequireKeycloakAuthenticationFilter>();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
});
var keycloakSection = builder.Configuration.GetSection("Authentication:Keycloak");
var keycloakEnabled = keycloakSection.GetValue<bool>("Enabled");
var keycloakAuthority = keycloakSection["Authority"];
var keycloakClientId = keycloakSection["ClientId"];
var keycloakClientSecret = keycloakSection["ClientSecret"];
var keycloakSettings = new KeycloakSettings
{
    Enabled = keycloakEnabled,
    Authority = keycloakAuthority,
    ClientId = keycloakClientId,
    ClientSecret = keycloakClientSecret,
    LegacyOwnerId = keycloakSection["LegacyOwnerId"] ?? "legacy"
};
builder.Services.AddSingleton(keycloakSettings);

keycloakSettings.Validate(builder.Environment.IsDevelopment());

if (keycloakSettings.IsConfigured)
{
    builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie(options =>
    {
        options.LoginPath = "/account/login";
        options.LogoutPath = "/account/logout";
        options.AccessDeniedPath = "/account/access-denied";
    })
    .AddOpenIdConnect(OpenIdConnectDefaults.AuthenticationScheme, options =>
    {
        options.Authority = keycloakAuthority;
        options.ClientId = keycloakClientId;
        options.ClientSecret = keycloakClientSecret;
        options.CallbackPath = "/signin-oidc";
        options.SignedOutCallbackPath = "/signout-callback-oidc";
        options.ResponseType = OpenIdConnectResponseType.Code;
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.SaveTokens = true;
        options.UsePkce = true;
        options.GetClaimsFromUserInfoEndpoint = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            NameClaimType = "preferred_username",
            RoleClaimType = "groups"
        };
        options.Scope.Clear();
        foreach (var scope in new[] { "openid", "profile", "email" })
        {
            options.Scope.Add(scope);
        }
        options.Events = new OpenIdConnectEvents
        {
            OnRemoteFailure = context =>
            {
                context.Response.Redirect("/account/authentication-error");
                context.HandleResponse();
                return Task.CompletedTask;
            }
        };
    });
}
else
{
    builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
        .AddCookie(options =>
        {
            options.LoginPath = "/account/login";
            options.LogoutPath = "/account/logout";
            options.AccessDeniedPath = "/account/access-denied";
        });
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseMigrationsEndPoint();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseAuthentication();

app.Use(async (context, next) =>
{
    var isAppShellRequest =
        context.Request.Path == "/"
        || context.Request.Path.Equals("/index.html", StringComparison.OrdinalIgnoreCase);

    if (keycloakSettings.IsConfigured
        && isAppShellRequest
        && context.User.Identity?.IsAuthenticated != true)
    {
        var returnUrl = context.Request.PathBase + context.Request.Path + context.Request.QueryString;
        await context.ChallengeAsync(
            OpenIdConnectDefaults.AuthenticationScheme,
            new AuthenticationProperties { RedirectUri = returnUrl });
        return;
    }

    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();

app.Use(async (context, next) =>
{
    var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
    var tokens = antiforgery.GetAndStoreTokens(context);
    if (!string.IsNullOrWhiteSpace(tokens.RequestToken))
    {
        context.Response.Headers["X-CSRF-TOKEN"] = tokens.RequestToken;
    }
    await next();
});

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "backend/{controller=Home}/{action=Index}/{id?}");

//Migrate DB on startup if running in a Development environment
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    using var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    context.Database.Migrate();
}

app.Run();

public partial class Program
{
}
