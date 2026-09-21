(() => {
  const $ = (id) => document.getElementById(id);
  const settings = $("account-settings");
  const status = $("account-settings-status");
  const csrf = () => globalThis.__wwwSqlCsrfToken || "";
  const request = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body) headers.set("Content-Type", "application/json");
    if (csrf()) headers.set("X-CSRF-TOKEN", csrf());
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "same-origin",
    });
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try {
        message = (await response.json()).error || message;
      } catch {
        /* text response */
      }
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  };
  const message = (text, error = false) => {
    status.textContent = text;
    status.className = error ? "error" : "";
  };
  const showSettings = () => {
    settings.removeAttribute("hidden");
    settings.style.display = "";
    $("controls").setAttribute("hidden", "");
    $("controls").style.display = "none";
    settings.focus();
    document.title = "Account and settings - WWW SQL Designer";
  };
  const clearPlaintext = () => {
    $("pat-plaintext").value = "";
    $("pat-once").hidden = true;
  };
  const showDesigner = () => {
    clearPlaintext();
    settings.setAttribute("hidden", "");
    settings.style.display = "none";
    $("controls").removeAttribute("hidden");
    $("controls").style.display = "";
    document.title = "WWW SQL Designer";
  };
  const isSignedIn = () => globalThis.__wwwSqlAuthenticated === true;
  const renderTokens = (tokens) => {
    const body = $("pat-table").querySelector("tbody");
    body.replaceChildren();
    for (const token of tokens) {
      const row = document.createElement("tr");
      const scopes = (() => {
        try {
          return JSON.parse(token.scopesJson).join(", ");
        } catch {
          return "Unavailable";
        }
      })();
      const expired = new Date(token.expiresAt) <= new Date();
      const revoked = Boolean(token.revokedAt);
      row.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td>`;
      row.children[0].textContent = `${token.name || "Unnamed"} (${token.prefix})`;
      row.children[1].textContent = scopes;
      row.children[2].textContent = new Date(token.createdAt).toLocaleString();
      row.children[3].textContent = new Date(token.expiresAt).toLocaleString();
      row.children[4].textContent = token.lastUsedAt
        ? new Date(token.lastUsedAt).toLocaleString()
        : "Never";
      row.children[5].textContent = revoked
        ? `Revoked ${new Date(token.revokedAt).toLocaleString()}`
        : "Active";
      if (!revoked && expired) {
        row.children[5].textContent = "Expired";
      }
      if (!revoked && !expired) {
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.textContent = "Revoke";
        revoke.addEventListener("click", async () => {
          if (
            !globalThis.confirm(
              "Revoke this token? Integrations using it will stop working.",
            )
          )
            return;
          try {
            await request(`/api/v1/tokens/${token.id}/revoke`, {
              method: "POST",
            });
            message("Token revoked.");
            await loadTokens();
            settings.focus();
          } catch (error) {
            message(error.message, true);
          }
        });
        row.children[6].append(revoke);
      }
      body.append(row);
    }
  };
  const loadTokens = async () => {
    if (!isSignedIn()) {
      $("pat-sign-in").hidden = false;
      $("pat-create-form").hidden = true;
      $("models-sign-in").hidden = false;
      $("application-create-form").hidden = true;
      $("application-select").disabled = true;
      $("model-create-form").hidden = true;
      $("variant-select").disabled = true;
      $("version-select").disabled = true;
      return;
    }
    $("pat-sign-in").hidden = true;
    $("pat-create-form").hidden = false;
    $("models-sign-in").hidden = true;
    $("application-create-form").hidden = false;
    $("application-select").disabled = false;
    try {
      renderTokens(await request("/api/v1/tokens"));
    } catch (error) {
      $("pat-error").hidden = false;
      $("pat-error").textContent = error.message;
    }
  };
  const fillApplications = async () => {
    if (!isSignedIn()) return;
    try {
      const apps = await request("/api/v1/applications");
      const select = $("application-select");
      select.replaceChildren(new Option("Select an application", ""));
      apps.forEach((app) =>
        select.add(new Option(`${app.name} (${app.status})`, app.id)),
      );
      $("models-status").textContent = apps.length
        ? ""
        : "No applications yet. Create one to get started.";
    } catch (error) {
      $("models-status").textContent = error.message;
    }
  };
  $("pat-create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("pat-error").hidden = true;
    const days = Number($("pat-expiry").value);
    const scopes = [
      ...document.querySelectorAll("[name=pat-scope]:checked"),
    ].map((x) => x.value);
    if (!Number.isInteger(days) || days < 1 || days > 90 || !scopes.length) {
      $("pat-error").hidden = false;
      $("pat-error").textContent =
        "Choose an expiry from 1 to 90 days and at least one scope.";
      return;
    }
    try {
      const created = await request("/api/v1/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: $("pat-name").value,
          scopes,
          expiresIn: `${days}.00:00:00`,
        }),
      });
      clearPlaintext();
      $("pat-plaintext").value = created.token;
      $("pat-once").hidden = false;
      $("pat-create-form").reset();
      message("Token created. Copy it now; it cannot be displayed again.");
      $("pat-plaintext").focus();
      await loadTokens();
    } catch (error) {
      $("pat-error").hidden = false;
      $("pat-error").textContent = error.message;
    }
  });
  $("pat-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("pat-plaintext").value);
      message("Token copied. Clear it from your clipboard when finished.");
    } catch {
      message(
        "The token could not be copied. Select and copy it manually.",
        true,
      );
    }
  });
  $("application-create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await request("/api/v1/applications", {
        method: "POST",
        body: JSON.stringify({
          name: $("application-name").value,
          description: $("application-description").value,
        }),
      });
      $("application-name").value = "";
      message("Application created.");
      await fillApplications();
      $("application-select").focus();
    } catch (error) {
      message(error.message, true);
    }
  });
  $("application-select").addEventListener("change", async () => {
    const id = $("application-select").value;
    $("model-create-form").hidden = !id;
    $("variant-select").replaceChildren(new Option("Select a variant", ""));
    $("version-select").replaceChildren(new Option("Select a version", ""));
    if (!id) return;
    try {
      const models = await request(
        `/api/v1/models?applicationId=${encodeURIComponent(id)}`,
      );
      for (const model of models)
        for (const variant of model.variants || []) {
          const option = new Option(
            `${model.name} / ${variant.name}`,
            variant.id,
          );
          option.dataset.modelId = model.id;
          $("variant-select").add(option);
        }
      $("variant-select").disabled = models.length === 0;
    } catch (error) {
      message(error.message, true);
    }
  });
  $("model-create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await request("/api/v1/models", {
        method: "POST",
        body: JSON.stringify({
          applicationId: $("application-select").value,
          name: $("model-name").value,
          variant: $("variant-name").value,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      message("Model and variant created.");
      $("model-create-form").reset();
      $("application-select").dispatchEvent(new Event("change"));
    } catch (error) {
      message(error.message, true);
    }
  });
  $("variant-select").addEventListener("change", async () => {
    const option = $("variant-select").selectedOptions[0];
    $("version-select").replaceChildren(new Option("Select a version", ""));
    if (!option?.value) return;
    try {
      const versions = await request(
        `/api/v1/models/${option.dataset.modelId}/variants/${option.value}/versions`,
      );
      versions.forEach((v) =>
        $("version-select").add(
          new Option(`Version ${v.number} — ${v.contentSha256}`, v.id),
        ),
      );
      $("version-select").disabled = !versions.length;
    } catch (error) {
      message(error.message, true);
    }
  });
  $("version-select").addEventListener("change", async () => {
    const version = $("version-select").value;
    const option = $("variant-select").selectedOptions[0];
    const variant = $("variant-select").value;
    const model = option?.dataset.modelId;
    if (!version) return;
    try {
      const v = await request(
        `/api/v1/models/${model}/variants/${variant}/versions/${version}`,
      );
      const snapshot = JSON.parse(v.snapshotJson);
      $("version-details").hidden = false;
      $("metadata-form").hidden = false;
      $("version-number").textContent = v.number;
      $("version-checksum").textContent = v.contentSha256;
      $("version-created-by").textContent = v.createdBy;
      $("version-created").textContent = new Date(v.createdAt).toLocaleString();
      $("exact-export").dataset.url =
        `/api/v1/models/${model}/variants/${variant}/versions/${version}/export`;
      $("metadata-form").dataset.version = version;
      $("metadata-form").dataset.model = model;
      $("metadata-form").dataset.checksum = v.contentSha256;
      const target = $("metadata-target-id");
      target.replaceChildren(new Option("Select a target", ""));
      const modelOption = new Option("Model", model);
      modelOption.dataset.targetType = "Model";
      target.add(modelOption);
      for (const table of snapshot.tables || []) {
        if (table.id) {
          target.add(new Option(`Entity: ${table.name || table.id}`, table.id));
          for (const column of table.columns || [])
            if (column.id)
              target.add(
                new Option(
                  `Property: ${table.name || "entity"}.${column.name || column.id}`,
                  column.id,
                ),
              );
        }
      }
      const terms = (await request("/api/v1/vocabularies")).flatMap(
        (x) => x.terms || [],
      );
      $("metadata-term").replaceChildren(new Option("Select a term", ""));
      terms.forEach((t) =>
        $("metadata-term").add(
          new Option(`${t.code} — ${t.description || ""}`, t.id),
        ),
      );
      const metadata = await request(
        `/api/v1/models/${model}/variants/${variant}/versions/${version}/metadata`,
      );
      $("metadata-summary").textContent = JSON.stringify(metadata, null, 2);
      $("version-details").focus();
    } catch (error) {
      message(error.message, true);
    }
  });
  $("metadata-target-type").addEventListener("change", () => {
    for (const option of $("metadata-target-id").options)
      option.hidden =
        option.value !== "" &&
        !option.textContent.startsWith($("metadata-target-type").value);
    $("metadata-target-id").value = "";
  });
  $("metadata-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = $("metadata-form");
    try {
      const assignments = [
        {
          targetType: $("metadata-target-type").value,
          targetId: $("metadata-target-id").value,
          vocabularyTermId: $("metadata-term").value,
          retentionDisposition: $("metadata-retention").value || null,
        },
      ];
      await request(
        `/api/v1/models/${form.dataset.model}/variants/${$("variant-select").value}/versions/${form.dataset.version}/metadata`,
        {
          method: "POST",
          body: JSON.stringify({
            assignments,
            expectedChecksum: form.dataset.checksum,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      message("Metadata published as a new immutable version.");
      $("variant-select").dispatchEvent(new Event("change"));
    } catch (error) {
      message(error.message, true);
    }
  });
  $("exact-export").addEventListener("click", async () => {
    try {
      const result = await request($("exact-export").dataset.url, {
        method: "POST",
        body: JSON.stringify({ format: $("export-format").value }),
      });
      const blob = new Blob([result.content], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `sql-designer-export.${$("export-format").value}`;
      link.click();
      URL.revokeObjectURL(link.href);
      message("Exact server export downloaded.");
    } catch (error) {
      message(error.message, true);
    }
  });
  $("import-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = $("import-file").files[0];
    if (!file) {
      $("import-status").textContent = "Choose an artifact first.";
      return;
    }
    try {
      const result = await request("/api/v1/models/import/preview", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          content: await file.text(),
        }),
      });
      $("import-form").dataset.content = await file.text();
      $("import-form").dataset.fileName = file.name;
      $("import-publish").disabled =
        !result.supported || !$("variant-select").value;
      $("import-status").textContent = result.supported
        ? `Preview ready for ${result.format}. Review diagnostics before publishing.`
        : `Import needs attention: ${result.diagnostics.join(" ")}`;
    } catch (error) {
      $("import-status").textContent = error.message;
    }
  });
  $("import-publish").addEventListener("click", async () => {
    try {
      const form = $("import-form");
      const option = $("variant-select").selectedOptions[0];
      const result = await request("/api/v1/models/import/publish", {
        method: "POST",
        body: JSON.stringify({
          modelId: option.dataset.modelId,
          variantId: option.value,
          fileName: form.dataset.fileName,
          content: form.dataset.content,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      $("import-status").textContent =
        `Published version ${result.number || "successfully"}.`;
      $("variant-select").dispatchEvent(new Event("change"));
    } catch (error) {
      $("import-status").textContent = error.message;
    }
  });
  $("return-to-designer").addEventListener("click", (event) => {
    event.preventDefault();
    history.replaceState(null, "", "/");
    showDesigner();
    setTimeout(showDesigner, 0);
  });
  globalThis.addEventListener("hashchange", () => {
    if (location.hash === "#account-settings") showSettings();
    else {
      showDesigner();
    }
  });
  if (location.hash === "#account-settings") showSettings();
  globalThis.addEventListener("load", () => {
    loadTokens();
    if (isSignedIn()) fillApplications();
  });
  document.addEventListener("wwwsql-auth-state", () => {
    loadTokens();
    if (isSignedIn()) fillApplications();
  });
})();
