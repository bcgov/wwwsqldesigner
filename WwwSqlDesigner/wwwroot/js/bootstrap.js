const signInForm = document.getElementById("signin-form");
const logoutForm = document.getElementById("logout-form");
const serverSourceButton = document.querySelector('[data-source="server"]');
const returnUrl = globalThis.location.pathname + globalThis.location.search;
signInForm.querySelector("input[name='returnUrl']").value = returnUrl;
logoutForm.querySelector("input[name='returnUrl']").value = returnUrl;
const setAuthenticationState = (enabled, authenticated, token) => {
    const authEnabled = enabled === true;
    const isAuthenticated = authEnabled && authenticated === true;
    const serverAvailable = !authEnabled || isAuthenticated;
    globalThis.__wwwSqlAuthenticated = isAuthenticated;
    globalThis.__wwwSqlServerAvailable = serverAvailable;
    signInForm.hidden = !authEnabled || isAuthenticated;
    logoutForm.hidden = !isAuthenticated || !token;
    serverSourceButton.disabled = !serverAvailable;
    serverSourceButton.setAttribute("aria-disabled", serverAvailable ? "false" : "true");
    if (isAuthenticated && token) {
        document.getElementById("logout-antiforgery-token").value = token;
    }
    if (globalThis.d?.io) {
        globalThis.d.io.setAuthenticationState(isAuthenticated, serverAvailable);
    }
};
globalThis.__wwwSqlSetAuthenticationState = setAuthenticationState;
const initializeAuthentication = async () => {
    try {
        const response = await fetch("/account/status", { credentials: "same-origin" });
        if (!response.ok) {
            setAuthenticationState(true, false);
            return;
        }

        const status = await response.json();
        const token = response.headers.get("X-CSRF-TOKEN");
        setAuthenticationState(status.enabled, status.authenticated, token);
    } catch {
        setAuthenticationState(true, false);
    }
};

globalThis.d = new SQL.Designer();
initializeAuthentication();
