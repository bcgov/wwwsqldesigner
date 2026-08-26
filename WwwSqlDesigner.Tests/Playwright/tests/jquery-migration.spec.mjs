import { test, expect } from "@playwright/test";

test("uses the vendored jQuery runtime without the legacy OZ dependency", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);

    await expect.poll(() => page.evaluate(() => ({
        jquery: window.jQuery && window.jQuery.fn.jquery,
        legacy: typeof OZ,
    }))).toEqual({
        jquery: "3.7.1",
        legacy: "undefined",
    });

    const table = await page.evaluate(() => {
        const created = d.addTable("Migrated", 40, 40);
        return {
            title: created.getTitle(),
            rendered: document.querySelectorAll(".table").length,
            selectedClass: $(".table").hasClass("selected"),
        };
    });
    expect(table).toEqual({ title: "Migrated", rendered: 1, selectedClass: false });
});

test("preserves the legacy request callback contract on jQuery requests", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof d !== "undefined" && d.io);
    await page.route("**/jquery-request-test", async (route) => {
        await route.fulfill({
            status: 201,
            headers: { "X-Test-Header": "ok" },
            body: "request body",
        });
    });

    const response = await page.evaluate(() => new Promise((resolve) => {
        SQL.request("/jquery-request-test", (data, code, headers) => resolve({
            data,
            code,
            header: headers["x-test-header"] || headers["X-Test-Header"],
        }));
    }));
    expect(response).toEqual({ data: "request body", code: 201, header: "ok" });
});
