import { test, expect } from "@playwright/test";

async function configureAuthenticatedStatus(page) {
    await page.route("**/account/status", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "X-CSRF-TOKEN": "test-token" },
            body: JSON.stringify({ enabled: true, authenticated: true }),
        });
    });
}

async function captureAlert(page, action) {
    const dialogPromise = new Promise((resolve) => {
        page.once("dialog", async (dialog) => {
            resolve(dialog.message());
            await dialog.dismiss();
        });
    });
    await action();
    return dialogPromise;
}

test("uses the centralized 401 response for a server catalogue refresh", async ({ page }) => {
    await configureAuthenticatedStatus(page);
    await page.route("**/backend/netcore-ef/list", async (route) => {
        await route.fulfill({ status: 401, body: "authentication required" });
    });

    await page.goto("/");
    await page.waitForFunction(() => d && d.io && d.io._serverAvailable);
    const alert = await captureAlert(page, () => page.locator("#saveload").click());

    expect(alert).toContain("401");
    await expect(page.locator('[data-source="server"]')).toBeDisabled();
    await expect(page.locator("#ioshare")).toHaveAttribute("hidden", "");
});

test("uses the centralized 401 response for a share-state refresh", async ({ page }) => {
    await configureAuthenticatedStatus(page);
    await page.route("**/backend/netcore-ef/list", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ models: [], currentOwnerId: "", currentOwnerLabel: "", groups: [] }),
        });
    });
    await page.route("**/backend/netcore-ef/access**", async (route) => {
        await route.fulfill({ status: 401, body: "authentication required" });
    });

    await page.goto("/");
    await page.waitForFunction(() => d && d.io && d.io._serverAvailable);
    await page.locator("#saveload").click();
    const alert = await captureAlert(page, () => page.evaluate(() => {
        d.io._name = "model";
        d.io._serverModelState = "owned";
        d.io.refreshShareState();
    }));

    expect(alert).toContain("401");
    await expect(page.locator('[data-source="server"]')).toBeDisabled();
    await expect(page.locator("#ioshare")).toHaveAttribute("hidden", "");
});

test("saves the selected client model name instead of the previous name", async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem("wwwsqldesigner_databases_A", "<sql><table name=\"A\" /></sql>");
        localStorage.setItem("wwwsqldesigner_databases_B", "<sql><table name=\"B\" /></sql>");
    });

    await page.goto("/");
    await page.locator("#saveload").click();
    await page.locator("#serverloadname").fill("A");
    await page.locator("#serverloadmodel").selectOption("B");
    await expect(page.locator("#serverloadname")).toHaveValue("B");
    await page.locator("#iosave").click();

    const savedNames = await page.evaluate(() => ({
        a: localStorage.getItem("wwwsqldesigner_databases_A"),
        b: localStorage.getItem("wwwsqldesigner_databases_B"),
    }));
    expect(savedNames.a).toBe("<sql><table name=\"A\" /></sql>");
    expect(savedNames.b).not.toBe("<sql><table name=\"B\" /></sql>");
});
