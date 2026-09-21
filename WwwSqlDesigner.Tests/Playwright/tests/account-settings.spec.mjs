import { test, expect } from "@playwright/test";

async function signedIn(page) {
  await page.route("**/account/status", (route) =>
    route.fulfill({
      status: 200,
      headers: { "X-CSRF-TOKEN": "csrf-test" },
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, authenticated: true }),
    }),
  );
}

test("account settings provides token and model management states", async ({
  page,
}) => {
  await signedIn(page);
  await page.route("**/api/ui/v1/tokens", (route) =>
    route.fulfill({
      status: route.request().method() === "GET" ? 200 : 201,
      contentType: "application/json",
      body:
        route.request().method() === "GET"
          ? "[]"
          : JSON.stringify({
              id: "token-id",
              token: "sqd_one_time",
              prefix: "sqd_one_time",
              expiresAt: "2030-01-01T00:00:00Z",
            }),
    }),
  );
  await page.route("**/api/ui/v1/applications", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/#account-settings");

  await expect(
    page.getByRole("heading", { name: "Account and settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to designer" }),
  ).toBeVisible();
  await page.getByLabel("Name (optional)").fill("build integration");
  await page.getByRole("button", { name: "Create token" }).click();
  await expect(page.locator("#pat-plaintext")).toHaveValue("sqd_one_time");
  await expect(page.locator("#pat-once")).toContainText(
    "will not be shown again",
  );
  await expect(page.locator("#pat-create-form")).toBeVisible();
  await expect(page.locator("#controls")).toHaveAttribute("hidden", "");
  await page.getByRole("button", { name: "Return to designer" }).click();
  await expect(page.locator("#pat-plaintext")).toHaveValue("");
  await expect(page.locator("#bar")).toBeVisible();
});

test("account settings uses request status and preserves exact export format", async ({
  page,
}) => {
  await signedIn(page);
  await page.route("**/api/ui/v1/tokens", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/api/ui/v1/applications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "app", name: "Data", status: "Active" }]),
    }),
  );
  await page.route("**/api/ui/v1/models?applicationId=app", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "model",
          name: "Orders",
          variants: [{ id: "variant", name: "default" }],
        },
      ]),
    }),
  );
  await page.route(
    "**/api/ui/v1/models/model/variants/variant/versions",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "version", number: 1, contentSha256: "abc" },
        ]),
      }),
  );
  await page.route(
    "**/api/ui/v1/models/model/variants/variant/versions/version",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          number: 1,
          contentSha256: "abc",
          createdBy: "owner",
          createdAt: "2030-01-01",
          snapshotJson: '{"tables":[]}',
        }),
      }),
  );
  await page.route("**/api/ui/v1/vocabularies", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto("/#account-settings");
  await page.locator("#application-select").selectOption("app");
  await page.locator("#variant-select").selectOption("variant");
  await page.locator("#version-select").selectOption("version");
  await expect(page.locator("#export-format option")).toHaveCount(8);
  expect(
    await page
      .locator("#export-format option")
      .evaluateAll((options) => options.map((option) => option.value)),
  ).toEqual([
    "ef-core",
    "mssql",
    "postgresql",
    "mysql",
    "sqlite",
    "oracle",
    "sqlalchemy",
    "web2py",
  ]);
  await page.locator("#export-format").selectOption("postgresql");
  await page.route("**/export", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: "CREATE TABLE example (id integer);",
        sidecar: '{"tables":[]}',
      }),
    }),
  );
  const exportRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/export") && request.method() === "POST",
  );
  const downloadNames = [];
  page.on("download", (download) =>
    downloadNames.push(download.suggestedFilename()),
  );
  await page.getByRole("button", { name: "Export this exact version" }).click();
  expect((await exportRequest).postDataJSON().format).toBe("postgresql");
  await expect.poll(() => downloadNames).toEqual([
    "sql-designer-export.sql",
    "sql-designer-export.metadata.json",
  ]);
});

test("legacy browser transformer and JSZip are not loaded", async ({
  page,
}) => {
  await page.goto("/");
  const source = await page
    .locator("html")
    .evaluate(() => document.documentElement.innerHTML);
  expect(source).not.toContain("jszip-3.10.1.min.js");
  expect(source).not.toContain("XSLTProcessor");
  expect(source).not.toContain("output.xsl");
});
