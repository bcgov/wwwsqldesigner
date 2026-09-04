import { test, expect } from "@playwright/test";

test("shows an accessible sign out control and submits the antiforgery token when available", async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "X-CSRF-TOKEN": "test-token" },
            body: JSON.stringify({ enabled: true, authenticated: true }),
        });
    });
    await page.route("**/account/logout", async (route) => {
        await route.fulfill({ status: 200, body: "signed out" });
    });

    await page.goto("/");

    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(page.locator("#signin-link")).toBeHidden();
    await expect(signOut).toBeVisible();
    await expect(page.locator("#account-controls #logout-form")).toBeVisible();
    await expect(page.locator("#logout-form")).toHaveAttribute("action", "/account/logout");
    await expect(page.locator("#logout-form input[name='returnUrl']")).toHaveValue("/");
    await expect(page.locator("#logout-form input[name='__RequestVerificationToken']")).toHaveValue("test-token");
    await page.locator("#saveload").click();
    await expect(page.locator('[data-source="server"]')).toBeEnabled();
    await expect(page.locator("#ioshare")).toBeVisible();
    await page.keyboard.press("Escape");

    const logoutRequestPromise = page.waitForRequest((request) =>
        new URL(request.url()).pathname === "/account/logout"
        && request.method() === "POST");
    await signOut.click();
    const logoutRequest = await logoutRequestPromise;
    const form = new URLSearchParams(logoutRequest.postData() || "");

    expect(form.get("returnUrl")).toBe("/");
    expect(form.get("__RequestVerificationToken")).toBe("test-token");
});

test("keeps sign out hidden when the user is anonymous", async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ enabled: true, authenticated: false }),
        });
    });

    await page.goto("/");

    await expect(page.locator("#logout-form")).toBeHidden();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await page.locator("#saveload").click();
    await expect(page.locator('[data-source="server"]')).toBeVisible();
    await expect(page.locator('[data-source="server"]')).toBeDisabled();
    await expect(page.locator('[data-source="server"]')).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#signin-link")).toHaveAttribute("type", "submit");
    await expect(page.locator("#logout-form input[type='submit']")).toHaveAttribute("type", "submit");
    await expect(page.locator("#signin-form")).toHaveAttribute("action", "/account/login");
    await expect(page.locator("#signin-form input[name='returnUrl']")).toHaveValue("/");
});

test("hides both account controls when authentication is disabled", async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ enabled: false, authenticated: false }),
        });
    });
    await page.route("**/backend/netcore-ef/list", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ models: [], currentOwnerId: "", currentOwnerLabel: "", groups: [] }),
        });
    });

    await page.goto("/");

    await expect(page.locator("#signin-link")).toBeHidden();
    await expect(page.locator("#logout-form")).toBeHidden();
    await page.locator("#saveload").click();
    await expect(page.locator('[data-source="server"]')).toBeVisible();
    await expect(page.locator('[data-source="server"]')).toBeEnabled();
    await expect(page.locator("#ioshare")).toBeVisible();
    await expect(page.locator("#server-import-group")).toBeVisible();
    await page.locator('[data-source="server"]').click();
    await expect(page.locator("#serverlist")).toBeEnabled();
});

test("preserves the current path and query in the sign-in return URL", async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ enabled: true, authenticated: false }),
        });
    });

    await page.goto("/index.html?keyword=orders%20model&version=4&ownerId=user-1");

    await expect(page.locator("#signin-form input[name='returnUrl']"))
        .toHaveValue("/index.html?keyword=orders%20model&version=4&ownerId=user-1");
});

test("keeps sign out hidden when authentication status is unavailable", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await page.route("**/account/status", async (route) => {
        await route.fulfill({ status: 503, body: "unavailable" });
    });

    await page.goto("/");

    await expect(page.locator("#logout-form")).toBeHidden();
    expect(pageErrors).toHaveLength(0);
});
