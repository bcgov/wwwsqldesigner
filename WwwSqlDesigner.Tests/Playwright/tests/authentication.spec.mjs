import { test, expect } from "@playwright/test";

test("shows an accessible sign out control and submits the antiforgery token when available", async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "X-CSRF-TOKEN": "test-token" },
            body: JSON.stringify(true),
        });
    });
    await page.route("**/account/logout", async (route) => {
        await route.fulfill({ status: 200, body: "signed out" });
    });

    await page.goto("/");

    await page.getByRole("button", { name: "Options" }).click();
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    await expect(page.locator("#logout-form")).toHaveAttribute("action", "/account/logout");
    await expect(page.locator("#logout-form input[name='returnUrl']")).toHaveValue("/?signedOut=1");
    await expect(page.locator("#logout-form input[name='__RequestVerificationToken']")).toHaveValue("test-token");

    const logoutRequestPromise = page.waitForRequest((request) =>
        new URL(request.url()).pathname === "/account/logout"
        && request.method() === "POST");
    await signOut.click();
    const logoutRequest = await logoutRequestPromise;
    const form = new URLSearchParams(logoutRequest.postData() || "");

    expect(form.get("returnUrl")).toBe("/?signedOut=1");
    expect(form.get("__RequestVerificationToken")).toBe("test-token");
});

test("keeps sign out hidden when the user is anonymous", async ({ page }) => {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(false),
        });
    });

    await page.goto("/");

    await expect(page.locator("#logout-form")).toBeHidden();
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("clears the signed-out marker after loading the anonymous designer", async ({ page }) => {
    await page.goto("/?signedOut=1");

    await expect(page).toHaveURL(/\/$/);
});
