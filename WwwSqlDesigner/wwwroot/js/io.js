SQL.IO = function (owner) {
    this.owner = owner;
    this._name = ""; /* last used name with server load/save */
    this._csrfToken = "";
    this._authenticated = window.__wwwSqlAuthenticated === true;
    this._serverAvailable = window.__wwwSqlServerAvailable === true;
    this._serverModelState = "none";
    this._serverModels = [];
    this._currentOwnerId = "";
    this._currentOwnerLabel = "";
    this.dom = {
        container: SQL.dom.get("loadsavepanel"),
    };

    let ids = [
        "saveload",
        "iosave",
        "ioload",
        "clientsql",
        "serverlist",
        "servershare",
        "serverunshare",
        "serverimport",
    ];
    for (let id of ids) {
        let elm = SQL.dom.get(id);
        this.dom[id] = elm;
        elm.value = _(id);
    }
    ids = ["servermodellabel", "serverloadmodellabel", "serverownerlabel",
        "serverversionlabel", "serveridlabel", "servergrouplabel",
        "serverimportdatabaselabel"];
    for (let id of ids) {
        let elm = SQL.dom.get(id);
        elm.innerHTML = _(id);
    }
    this.dom.serverlist.textContent = _("serverlist");
    this.dom.serverlist.title = _("serverlisttitle");
    this.dom.serverunshare.value = _("serverunshare");

    this.dom.iosave.value = _("clientsave");
    this.dom.ioload.value = _("clientload");
    this.dom.iotype = SQL.dom.get("iotype");
    this.dom.iopanel = SQL.dom.get("iopanel");
    this.dom.sharepanel = SQL.dom.get("ioshare");
    this.dom.iosourcebuttons = Array.from(document.querySelectorAll("#iosourcebuttons .io-source-button"));
    const sourceLabels = { browser: "client", xml: "clientfile", server: "server" };
    this.dom.iosourcebuttons.forEach((button) => {
        const source = button.getAttribute("data-source");
        button.textContent = _(sourceLabels[source] || source);
    });
    SQL.dom.get("iosourcebuttons").setAttribute("aria-label", _("iosourcelabel"));
    this.dom.backend = SQL.dom.get("backend");
    this.dom.exporttarget = SQL.dom.get("exporttarget");
    this.dom.serverimportdatabase = SQL.dom.get("serverimportdatabase");
    this.dom.exporttargetlabel = SQL.dom.get("exporttargetlabel");
    this.dom.status = SQL.dom.get("iostatus");
    const exportLabel = _("exporttarget"); this.dom.exporttargetlabel.textContent = exportLabel === "exporttarget" ? "Format" : exportLabel;
    this.dom.serverloadname = SQL.dom.get("serverloadname");
    this.dom.clientlocalname = this.dom.serverloadname;
    this.dom.serverloadmodel = SQL.dom.get("serverloadmodel");
    this.dom.clientlocalmodel = this.dom.serverloadmodel;
    this.dom.serverloadname.style.display = "";
    this.dom.serverloadversion = SQL.dom.get("serverloadversion");
    this.dom.serverSaveRow = SQL.dom.get("server-save-row");
    this.dom.serverLoadRow = SQL.dom.get("server-load-row");
    this.dom.serverowner = SQL.dom.get("serverowner");
    this.dom.serverownercontrol = SQL.dom.get("serverownercontrol");
    this.dom.serverversioncontrol = SQL.dom.get("serverversioncontrol");
    this.dom.servergrantid = SQL.dom.get("servergrantid");
    this.dom.servergrantgroup = SQL.dom.get("servergrantgroup");
    this.dom.serverknownuser = SQL.dom.get("serverknownuser");
    this.dom.serverknowngroup = SQL.dom.get("serverknowngroup");
    this.dom.servercopyid = SQL.dom.get("servercopyid");
    this.dom.servercopyid.textContent = _("servercopyid");
    this.dom.servercopyid.title = _("servercopytitle");
    this.dom.servergrantid.value = "";
    this.dom.servergrantgroup.value = "";
    this.dom.sharepanel.style.display = "";
    this._actionLabelTimers = {};
    this._currentGroups = [];
    this._serverGrants = [];
    this._clientModelNames = [];
    this.updateServerModelControls();
    this.updateServerUi();

    this.dom.container.parentNode.removeChild(this.dom.container);
    this.dom.container.style.visibility = "";

    this.saveresponse = this.saveresponse.bind(this);
    this.loadresponse = this.loadresponse.bind(this);
    this.listresponse = this.listresponse.bind(this);
    this.importresponse = this.importresponse.bind(this);

    SQL.events.add(this.dom.saveload, "click", this.click.bind(this));
    SQL.events.add(this.dom.iosave, "click", this.saveCurrent.bind(this));
    SQL.events.add(this.dom.ioload, "click", this.loadCurrent.bind(this));
    SQL.events.add(this.dom.clientsql, "click", this.clientsql.bind(this));
    SQL.events.add(this.dom.exporttarget, "change", this.changeExportTarget.bind(this));
    SQL.events.add(this.dom.serverimportdatabase, "input", this.updateExportButtons.bind(this));
    SQL.events.add(this.dom.serverlist, "click", () => this.serverlist(null, true));
    SQL.events.add(this.dom.servershare, "click", this.servershare.bind(this));
    SQL.events.add(this.dom.serverunshare, "click", this.serverunshare.bind(this));
    SQL.events.add(this.dom.servercopyid, "click", this.copyCurrentOwnerId.bind(this));
    SQL.events.add(this.dom.serverimport, "click", this.serverimport.bind(this));
    SQL.events.add(this.dom.serverloadname, "input", this.updateServerModelControls.bind(this));
    SQL.events.add(this.dom.iotype, "change", this.updateIoType.bind(this));
    this.dom.iosourcebuttons.forEach((button) => {
        SQL.events.add(button, "click", () => {
            this.dom.iotype.value = button.getAttribute("data-source");
            this.updateIoType();
        });
    });
    SQL.events.add(this.dom.serverloadname, "input", this.updateIoType.bind(this));
    SQL.events.add(this.dom.serverloadmodel, "change", () => {
        if (this.dom.iotype.value === "server") {
            this.updateServerModelChoices(true);
            return;
        }
        if (this.dom.clientlocalmodel.value) {
            this.dom.clientlocalname.value = this.dom.clientlocalmodel.value;
        }
        this.updateServerModelControls();
    });
    SQL.events.add(this.dom.servergrantid, "input", () => {
        if (this.dom.servergrantid.value) this.dom.servergrantgroup.value = "";
        this.updateServerModelControls();
        this.updateIoType();
    });
    SQL.events.add(this.dom.servergrantgroup, "change", () => {
        if (this.dom.servergrantgroup.value) this.dom.servergrantid.value = "";
        this.updateServerModelControls();
    });
    SQL.events.add(this.dom.serverknownuser, "change", () => {
        this.dom.servergrantid.value = this.dom.serverknownuser.value;
        this.dom.serverknowngroup.value = "";
        this.updateServerModelControls();
    });
    SQL.events.add(this.dom.serverknowngroup, "change", () => {
        this.dom.servergrantgroup.value = this.dom.serverknowngroup.value;
        this.dom.serverknownuser.value = "";
        this.updateServerModelControls();
    });
    SQL.events.add(this.dom.serverowner, "change", () => this.updateServerModelChoices(true));
    SQL.events.add(this.dom.backend, "change", this.serverlist.bind(this));
    SQL.events.add(document, "keydown", this.press.bind(this));
    this.build();
};

SQL.IO.prototype.setAuthenticationState = function (authenticated, serverAvailable) {
    this._authenticated = authenticated === true;
    this._serverAvailable = serverAvailable === true;
    this.updateServerUi();
    if (!this._serverAvailable) {
        this._serverModels = [];
        this._serverModelState = "none";
        this._serverGrants = [];
        if (this.dom.iotype.value === "server") {
            this.dom.iotype.value = "browser";
        }
        this.updateIoType();
        return;
    }
    this.owner.loadServerDeepLink();
};

SQL.IO.prototype.setAuthenticated = function (authenticated) {
    this.setAuthenticationState(authenticated, authenticated);
};

SQL.IO.prototype.updateServerUi = function () {
    const enabled = this._serverAvailable;
    this.dom.iosourcebuttons
        .filter((button) => button.getAttribute("data-source") === "server")
        .forEach((button) => {
            button.hidden = false;
            button.disabled = !enabled;
            button.setAttribute("aria-disabled", enabled ? "false" : "true");
        });
    ["ioshare", "server-import-group"]
        .forEach((id) => {
            const element = SQL.dom.get(id);
            if (element) {
                element.hidden = !enabled;
            }
        });
    this.updateServerModelControls();
};

SQL.IO.prototype.shareclick = function () {
    this.build();
    this.updateIoType();
    this.owner.window.open(_("saveload"), this.dom.container);
};

SQL.IO.prototype.syncClientColumnHeight = function () {
    return;
};

SQL.IO.prototype.setActionLabel = function (action, label) {
    const button = action === "servercopy" ? this.dom.servercopyid : this.dom.serverlist;
    const defaultLabel = action === "servercopy" ? _("servercopyid") : _("serverlist");
    if (this._actionLabelTimers[action]) {
        clearTimeout(this._actionLabelTimers[action]);
        delete this._actionLabelTimers[action];
    }
    button.textContent = label || defaultLabel;
    if (label) {
        this._actionLabelTimers[action] = setTimeout(() => {
            button.textContent = defaultLabel;
            delete this._actionLabelTimers[action];
        }, 1800);
    }
};

SQL.IO.prototype.setCsrfToken = function (headers, data) {
    const token = headers && (headers["X-CSRF-TOKEN"] || headers["x-csrf-token"]);
    const responseToken = token || (typeof data === "string" ? data.trim() : "");
    if (responseToken) {
        this._csrfToken = responseToken;
    }
};

SQL.IO.prototype.ensureCsrfToken = function (callback, failure) {
    if (this._csrfToken) {
        callback();
        return;
    }

    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/csrf";
    const h = this.owner.getXhrHeaders();
    SQL.request(url, (data, code, headers) => {
        this.setCsrfToken(headers, data);
        if (code >= 200 && code < 300 && this._csrfToken) {
            callback();
            return;
        }
        if (failure) {
            failure();
        }
    }, { headers: h });
};

SQL.IO.prototype.build = function () {
    SQL.dom.clear(this.dom.backend);

    const bs = CONFIG.AVAILABLE_BACKENDS;
    let be = CONFIG.DEFAULT_BACKEND;
    const r = window.location.search.substring(1).match(/backend=([^&]*)/);
    if (r) {
        const req = r[1];
        if (bs.indexOf(req) != -1) {
            be = req;
        }
    }
    for (let i = 0; i < bs.length; i++) {
        let o = SQL.dom.create("option");
        o.value = bs[i];
        o.innerHTML = bs[i];
        this.dom.backend.appendChild(o);
        if (bs[i] == be) {
            this.dom.backend.selectedIndex = i;
        }
    }

    SQL.dom.clear(this.dom.exporttarget);
    const placeholder = SQL.dom.create("option");
    placeholder.value = "";
    placeholder.textContent = "";
    placeholder.selected = true;
    this.dom.exporttarget.appendChild(placeholder);
    for (const target of CONFIG.EXPORT_TARGETS) {
        const option = SQL.dom.create("option");
        option.value = target.id;
        option.textContent = target.label;
        this.dom.exporttarget.appendChild(option);
    }
    this.updateExportButtons();
};

SQL.IO.prototype.click = function () {
    /* open io dialog */
    this.build();
    this.dom.serverloadname.value = this.dom.iotype.value === "browser"
        ? ""
        : this._name || "";
    this.refreshClientStorageModels();
    this.updateIoType();
    this.refreshExportTargetLabel();
    this.owner.window.open(_("saveload"), this.dom.container);
    this.dom.serverloadname.focus();
    this.syncClientColumnHeight();
    if (this._serverAvailable && !this._serverModels.length) {
        this.serverlist(null, true);
    }
};

SQL.IO.prototype.refreshExportTargetLabel = function () {
    this.dom.clientsql.value = _("clientexport");
};

SQL.IO.prototype.saveCurrent = function () {
    const type = this.dom.iotype.value;
    if (type === "browser") return this.clientlocalsave();
    if (type === "xml") return this.clientsave();
    return this.serversave();
};

SQL.IO.prototype.loadCurrent = function () {
    const type = this.dom.iotype.value;
    if (type === "browser") return this.clientlocalload();
    if (type === "xml") return this.clientload();
    return this.serverload();
};

SQL.IO.prototype.updateIoType = function () {
    const type = this.dom.iotype.value;
    const server = type === "server" && this._serverAvailable;
    const browser = type === "browser";
    this.dom.serverloadmodel.disabled = type === "xml";
    this.dom.serverowner.disabled = !server;
    this.dom.serverloadversion.disabled = !server;
    this.dom.serverlist.disabled = !server;
    if (browser) {
        this.renderClientModelChoices();
    } else if (server) {
        this.updateServerModelChoices();
    }
    this.dom.iosave.disabled = !this.dom.serverloadname.value.trim();
    this.dom.ioload.disabled = type === "server"
        ? !this.dom.serverloadmodel.value
        : type === "browser" ? !this.dom.serverloadmodel.value : false;
    this.dom.iosourcebuttons.forEach((button) => {
        const selected = button.getAttribute("data-source") === type;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
};

SQL.IO.prototype.changeExportTarget = function () {
    if (this.dom.exporttarget.value) {
        this.owner.setOption("lastExportTarget", this.getExportTarget());
    }
    this.updateExportButtons();
    this.refreshExportTargetLabel();
};

SQL.IO.prototype.updateExportButtons = function () {
    const target = this.dom.exporttarget.value;
    this.dom.clientsql.disabled = !target;
    this.dom.serverimport.disabled = !this.dom.serverimportdatabase.value.trim();
};

SQL.IO.prototype.parseXml = function (xml) {
    if (typeof xml !== "string") {
        throw new Error("Invalid XML input.");
    }

    /* The designer model and bundled XSLT do not use DTDs. Reject them before
     * parsing so entity expansion and external entity resolution are unavailable. */
    if (/<\s*!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
        throw new Error("DTD and entity declarations are not allowed.");
    }

    if (!window.DOMParser) {
        throw new Error("No XML parser available.");
    }

    const xmlDoc = new DOMParser().parseFromString(xml, "text/xml");
    if (xmlDoc.querySelector("parsererror")) {
        throw new Error("Invalid XML.");
    }

    return xmlDoc;
};

SQL.IO.prototype.fromXMLText = function (xml) {
    this.showStatus();
    try {
        const xmlDoc = this.parseXml(xml);
        return this.fromXML(xmlDoc);
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
        return false;
    }
};

SQL.IO.prototype.fromXML = function (xmlDoc) {
    this.showStatus();
    if (!xmlDoc || !xmlDoc.documentElement) {
        alert(_("xmlerror") + ": Null document");
        return false;
    }
    try {
        if (!this.owner.fromXML(xmlDoc.documentElement)) { return false; }
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
        return false;
    }
    /* Keep the pane open when conversion warnings need to be read. */
    if (this.dom.status.hidden) { this.owner.window.close(); }
    return true;
};

SQL.IO.prototype.clientsave = function () {
    this._name = this.dom.serverloadname.value.trim();
    if (!this._name) {
        return;
    }
    const xml = this.owner.toXML(true);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (this._name || "database") + ".xml";
    link.click();
    URL.revokeObjectURL(url);
};

SQL.IO.prototype.clientload = function () {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,application/xml,text/xml";
    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener("load", () => {
            if (typeof reader.result !== "string") {
                throw new Error("Unable to read XML file.");
            }
            if (this.fromXMLText(reader.result)) {
                this._serverModelState = "none";
                this._name = "";
                this.dom.serverloadname.value = "";
                this.updateServerModelControls();
            }
        });
        reader.readAsText(file);
    });
    input.click();
};

SQL.IO.prototype.clientlocalsave = function () {
    if (!window.localStorage) {
        alert("Sorry, your browser does not seem to support localStorage.");
        return;
    }

    let key = this.dom.clientlocalname.value.trim();
    if (!key) {
        this.dom.clientlocalname.focus();
        return;
    }

    const xml = this.owner.toXML(true);
    if (xml.length >= (5 * 1024 * 1024) / 2) {
        /* this is a very big db structure... */
        alert(
            "Warning: your database structure is above 5 megabytes in size, this is above the localStorage single key limit allowed by some browsers, example Mozilla Firefox 10"
        );
        return;
    }

    const modelName = key || "default";
    key = "wwwsqldesigner_databases_" + modelName;

    try {
        localStorage.setItem(key, xml);
        if (localStorage.getItem(key) != xml) {
            throw new Error("Content verification failed");
        }
        const modelName = key.substring("wwwsqldesigner_databases_".length);
        this.refreshClientStorageModels();
        this.dom.clientlocalmodel.value = modelName;
        this.updateClientStorageControls();
    } catch (e) {
        alert(
            "Error saving database structure to localStorage! (" +
            e.message +
            ")"
        );
    }
};

SQL.IO.prototype.clientlocalload = function () {
    if (!window.localStorage) {
        alert("Sorry, your browser does not seem to support localStorage.");
        return;
    }

    let key = this.dom.clientlocalmodel.value || this.dom.clientlocalname.value.trim();
    if (!key) {
        return;
    }

    const modelName = key || "default";
    key = "wwwsqldesigner_databases_" + modelName;

    let xml;
    try {
        xml = localStorage.getItem(key);
        if (!xml) {
            throw new Error("No data available");
        }
    } catch (e) {
        alert(
            "Error loading database structure from localStorage! (" +
            e.message +
            ")"
        );
        return;
    }

    if (this.fromXMLText(xml)) {
        this._serverModelState = "none";
        this._name = "";
        this.dom.serverloadname.value = modelName;
        this.updateServerModelControls();
    }
};

SQL.IO.prototype.refreshClientStorageModels = function () {
    const prefix = "wwwsqldesigner_databases_";
    const names = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            names.push(key.substring(prefix.length));
        }
    }
    names.sort((a, b) => a.localeCompare(b));
    this._clientModelNames = names;
    if (this.dom.iotype.value === "browser") {
        this.renderClientModelChoices();
    }
};

SQL.IO.prototype.renderClientModelChoices = function () {
    const placeholder = SQL.dom.create("option");
    placeholder.value = "";
    placeholder.textContent = "";
    SQL.dom.clear(this.dom.clientlocalmodel);
    this.dom.clientlocalmodel.appendChild(placeholder);
    this._clientModelNames.forEach((name) => {
        const option = SQL.dom.create("option");
        option.value = name;
        option.textContent = name;
        this.dom.clientlocalmodel.appendChild(option);
    });
};

SQL.IO.prototype.updateClientStorageControls = function () {
    this.updateIoType();
};

SQL.IO.prototype.clientlocallist = function () {
    if (!window.localStorage) {
        alert("Sorry, your browser does not seem to support localStorage.");
        return;
    }

    /* --- Define some useful vars --- */
    const baseKeysName = "wwwsqldesigner_databases_";
    const localLen = localStorage.length;
    let data = "";
    let schemasFound = false;
    const code = 200;

    /* --- work --- */
    try {
        for (let i = 0; i < localLen; ++i) {
            const key = localStorage.key(i);
            if (new RegExp(baseKeysName).test(key)) {
                const result = key.substring(baseKeysName.length);
                schemasFound = true;
                data += result + "\n";
            }
        }
        if (!schemasFound) {
            throw new Error("No data available");
        }
    } catch (e) {
        alert(
            "Error loading database names from localStorage! (" +
            e.message +
            ")"
        );
        return;
    }
    this.listresponse(data, code);
};

SQL.IO.prototype.clientsql = function () {
    if (this.getExportTarget() === "ef") {
        this.clientef();
        return;
    }
    const bp = this.owner.getOption("staticpath");
    const target = this.getExportTarget();
    const path = bp + "db/" + target + "/output.xsl";
    const h = this.owner.getXhrHeaders();
    h['transformation'] = target;
    this.owner.window.showThrobber();
    SQL.request(path, this.finish.bind(this), { xml: true, headers: h });
};

SQL.IO.prototype.clientef = function () {
    const xml = this.getSafeExportXml("ef");
    if (!xml) { return; }
    const tableCount = this.getModelTableCount(xml);
    if (!tableCount) {
        alert(_("efzipexportempty"));
        return;
    }

    const path = this.owner.getOption("staticpath") + "db/ef/output.xsl";
    this.owner.window.showThrobber();
    this.getXSL(path, (err, xslDoc) => {
        if (err) {
            this.owner.window.hideThrobber();
            alert(_("efzipexporterror"));
            return;
        }
        try {
            const source = this.transformEf(xslDoc, xml);
            const files = this.createEfZipFiles(source, this.getEfSettings().context, tableCount);
            if (files.length === 1) {
                this.downloadTextFile(files[0].contents, files[0].name);
                this.owner.window.hideThrobber();
            } else {
                const zip = new JSZip();
                files.forEach((file) => zip.file(file.name, file.contents));
                zip.generateAsync({ type: "blob", compression: "DEFLATE" })
                    .then((archive) => this.downloadEfZip(archive, files.contextName))
                    .catch(() => alert(_("efzipexporterror")))
                    .finally(() => this.owner.window.hideThrobber());
            }
        } catch (e) {
            this.owner.window.hideThrobber();
            alert(_("efzipexporterror"));
        }
    });
};

SQL.IO.prototype.getExportTarget = function () {
    return this.getExportTargetDefinition().id;
};

SQL.IO.prototype.getExportTargetDefinition = function () {
    const selected = this.dom.exporttarget.value || this.owner.getOption("lastExportTarget");
    return CONFIG.EXPORT_TARGETS.find((target) => target.id === selected)
        || CONFIG.EXPORT_TARGETS.find((target) => target.id === CONFIG.DEFAULT_DB);
};

SQL.IO.nvarcharByteLength = function (value) {
    // sp_addextendedproperty accepts at most 7,500 bytes for an nvarchar value.
    return String(value || "").length * 2;
};

SQL.IO.hasXmlContent = SQL.hasXmlContent;

SQL.IO.prototype.showStatus = function (diagnostics, heading, unsafe) {
    const messages = Array.from(new Set(diagnostics || []));
    SQL.dom.clear(this.dom.status);
    this.dom.status.hidden = messages.length === 0;
    this.dom.status.classList.toggle("unsafe", !!unsafe);
    if (!messages.length) { return false; }

    const title = SQL.dom.create("strong");
    title.textContent = heading;
    this.dom.status.appendChild(title);
    const list = SQL.dom.create("ul");
    messages.forEach((message) => {
        const item = SQL.dom.create("li");
        item.textContent = message;
        list.appendChild(item);
    });
    this.dom.status.appendChild(list);
    return true;
};

/* Maps a serialized copy only; target selection never rewrites the editor. */
SQL.IO.prototype.getExportXml = function (target) {
    const doc = this.parseXml(this.owner.toXML());
    const diagnostics = [];
    let safe = true;
    for (const row of doc.querySelectorAll("sql > table > row")) {
        const datatype = SQL.Designer.directChild(row, "datatype");
        const portable = SQL.PortableTypes.canonical(datatype ? datatype.textContent : "");
        const mapped = portable ? SQL.PortableTypes.map(portable, target) : { safe: false, diagnostics: ["Invalid portable datatype."], type: "" };
        if (target === "ef" && !mapped.safe) {
            const table = row.parentElement;
            const columnName = SQL.Designer.effectiveSchema(table.getAttribute("schema")) + "." +
                table.getAttribute("name") + "." + row.getAttribute("name");
            diagnostics.push.apply(diagnostics, mapped.diagnostics.map((message) => columnName + ": " + message));
        } else {
            diagnostics.push.apply(diagnostics, mapped.diagnostics);
        }
        safe = safe && mapped.safe;
        if (mapped.safe && datatype) { datatype.textContent = mapped.type; }
    }
    const datatypes = doc.querySelector("sql > datatypes");
    if (datatypes) { datatypes.setAttribute("db", target); }
    const supportsSchema = target === "mssql" || target === "ef";
    const supportsDescriptions = supportsSchema || target === "postgresql" || target === "oracle";
    const supportsClassification = target === "mssql" || target === "ef";
    const supportsRecordsSchedule = target === "mssql" || target === "ef";
    if (!supportsSchema) {
        const tables = Array.from(doc.querySelectorAll("sql > table"));
        if (tables.some((table) =>
            SQL.Designer.effectiveSchema(table.getAttribute("schema")).toLowerCase() !== "dbo")) {
            diagnostics.push(target + " export omits non-default schema metadata.");
        }
        const projected = new Map();
        for (const table of tables) {
            const identity = SQL.Designer.tableIdentity("", table.getAttribute("name"));
            const sources = projected.get(identity) || [];
            sources.push(SQL.Designer.effectiveSchema(table.getAttribute("schema")) +
                "." + table.getAttribute("name"));
            projected.set(identity, sources);
        }
        for (const sources of projected.values()) {
            if (sources.length < 2) { continue; }
            diagnostics.push(target + " export maps qualified tables " +
                sources.slice().sort().join(", ") +
                " to the same unqualified table name.");
            safe = false;
        }
    }
    if (!supportsDescriptions && Array.from(doc.querySelectorAll("sql > table > comment, sql > table > row > comment")).some((comment) =>
        SQL.hasXmlContent(comment.textContent))) {
        diagnostics.push(target + " export omits table and column descriptions.");
    }
    if (!supportsClassification && doc.querySelector("sql > table > row > classification")) {
        diagnostics.push(target + " export omits column data classifications.");
    }
    if (!supportsRecordsSchedule && Array.from(doc.querySelectorAll("sql > table > records-schedule")).some((recordsSchedule) =>
        SQL.hasXmlContent(recordsSchedule.textContent))) {
        diagnostics.push(target + " export omits table records schedules.");
    }
    if (supportsSchema) {
        for (const table of doc.querySelectorAll("sql > table")) {
            const schema = SQL.Designer.effectiveSchema(table.getAttribute("schema"));
            const tableName = schema + "." + table.getAttribute("name");
            const descriptions = [{
                comment: SQL.Designer.directChild(table, "comment"),
                name: tableName,
            }];
            for (const row of table.querySelectorAll(":scope > row")) {
                descriptions.push({
                    comment: SQL.Designer.directChild(row, "comment"),
                    name: tableName + "." + row.getAttribute("name"),
                });
            }
            for (const description of descriptions) {
                const text = description.comment ? description.comment.textContent : "";
                if (!SQL.hasXmlContent(text)) { continue; }
                const bytes = SQL.IO.nvarcharByteLength(text);
                if (bytes > 7500) {
                    diagnostics.push(description.name + " description is " + bytes
                        + " bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the description.");
                    safe = false;
                }
            }
        }
        if (target === "mssql") {
            for (const table of doc.querySelectorAll("sql > table")) {
                const recordsSchedule = SQL.Designer.directChild(table, "records-schedule");
                const text = recordsSchedule ? recordsSchedule.textContent : "";
                if (!SQL.hasXmlContent(text)) { continue; }
                const bytes = SQL.IO.nvarcharByteLength(text);
                if (bytes > 7500) {
                    const name = SQL.Designer.effectiveSchema(table.getAttribute("schema")) +
                        "." + table.getAttribute("name");
                    diagnostics.push(name + " records schedule is " + bytes
                        + " bytes; the SQL Server limit is 7,500 bytes. No download was created; shorten the records schedule.");
                    safe = false;
                }
            }
        }
    }
    if (target === "mssql" && doc.querySelector("sql > table > key[type='FULLTEXT']")) {
        diagnostics.push("Microsoft SQL Server export omits portable FULLTEXT keys.");
    }
    return { xml: new XMLSerializer().serializeToString(doc), diagnostics: diagnostics, safe: safe };
};

SQL.IO.prototype.getSafeExportXml = function (target) {
    const mapped = this.getExportXml(target);
    this.showStatus(mapped.diagnostics,
        mapped.safe ? _("exportwarning") : _("exportunsafe"), !mapped.safe);
    return mapped.safe ? mapped.xml : null;
};

SQL.IO.prototype.downloadTextFile = function (contents, name) {
    const blob = new Blob([contents], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
};

SQL.IO.prototype.getXSL = function (xslPath, cb) {
    const xhr = new XMLHttpRequest();
    let completed = false;
    const complete = (err, xslDoc) => {
        if (completed) {
            return;
        }
        completed = true;
        cb(err, xslDoc);
    };

    xhr.open("GET", xslPath, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            if (xhr.status == 200) {
                complete(null, xhr.responseText);
            } else {
                complete(new Error("Unable to load export stylesheet."));
            }
        }
    };
    xhr.onerror = function () {
        complete(new Error("Unable to load export stylesheet."));
    };
    xhr.send();
};

SQL.IO.prototype.getEfSettings = function () {
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const namespace = (this.owner.getOption("efnamespace") || "").trim();
    const context = (this.owner.getOption("efcontext") || "").trim();
    const namespaceParts = namespace.split(".");
    const validNamespace = namespace.length > 0 && namespaceParts.every(
        (part) => identifier.test(part) && !CONFIG.CSHARP_KEYWORDS.includes(part)
    );
    const validContext = identifier.test(context) && !CONFIG.CSHARP_KEYWORDS.includes(context);

    return {
        namespace: validNamespace ? namespace : CONFIG.EF_DEFAULT_NAMESPACE,
        context: validContext ? context : CONFIG.EF_DEFAULT_CONTEXT,
    };
};

SQL.IO.prototype.finish = function () {
    const transformationType = this.owner.getXhrHeaders().transformation;
    let xslPath = '';

    xslPath = this.owner.getOption("staticpath") + "db/" + transformationType + "/output.xsl";

    // Get XSL content and invoke transformation
    this.getXSL(xslPath, (err, doc) => {
        if (err) {
            alert(_("xmlerror") + ": " + err.message);
            this.owner.window.hideThrobber();
            return;
        }
        const xml = this.getSafeExportXml(transformationType);
        if (xml) {
            this.performTransformation(doc, xml);
        }
        this.owner.window.hideThrobber();
    });
};

SQL.IO.prototype.performTransformation = function (xslDoc, xml) {
    try {
        const target = this.owner.getXhrHeaders().transformation;
        const extension = target === "ef" ? "cs" : "sql";
        this.downloadTextFile(
            this.transformEf(xslDoc, xml, target === "ef"),
            (this._name || "database") + "." + extension);
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
    }
};

SQL.IO.prototype.transformEf = function (xslDoc, xml, applyEfSettings = true) {
    if (!window.XSLTProcessor || !window.DOMParser) {
        throw new Error("No XSLT processor available");
    }

    const xmlDoc = this.parseXml(xml);
    if (typeof xslDoc === "string") {
        xslDoc = this.parseXml(xslDoc);
    }
    const xsl = new XSLTProcessor();
    xsl.importStylesheet(xslDoc);
    if (applyEfSettings) {
        const settings = this.getEfSettings();
        xsl.setParameter(null, "namespace", settings.namespace);
        xsl.setParameter(null, "context", settings.context);
    }
    const transformedDocument = xsl.transformToDocument(xmlDoc);
    const result = transformedDocument.documentElement
        ? transformedDocument.documentElement.textContent
        : transformedDocument.textContent;
    return result.trim();
};

SQL.IO.prototype.getModelTableCount = function (xml) {
    try {
        const xmlDoc = this.parseXml(xml);
        return xmlDoc.querySelectorAll("sql > table").length;
    } catch (e) {
        return 0;
    }
};

SQL.IO.prototype.createEfZipFiles = function (source, contextName, tableCount) {
    const classes = [];
    const classPattern = /public class\s+(@?[A-Za-z_][A-Za-z0-9_]*)\b[^\{]*\{/g;
    let match;
    while ((match = classPattern.exec(source))) {
        let depth = 0;
        let end = match.index + match[0].length - 1;
        let state = "code";
        let escaped = false;
        for (; end < source.length; end++) {
            const current = source[end];
            const next = source[end + 1];
            if (state === "line") {
                if (current === "\n") { state = "code"; }
                continue;
            }
            if (state === "block") {
                if (current === "*" && next === "/") { state = "code"; end++; }
                continue;
            }
            if (state === "string" || state === "char") {
                if (escaped) { escaped = false; continue; }
                if (current === "\\") { escaped = true; continue; }
                if ((state === "string" && current === '"') || (state === "char" && current === "'")) { state = "code"; }
                continue;
            }
            if (current === "/" && next === "/") { state = "line"; end++; continue; }
            if (current === "/" && next === "*") { state = "block"; end++; continue; }
            if (current === '"') { state = "string"; continue; }
            if (current === "'") { state = "char"; continue; }
            if (current === "{") { depth++; }
            if (current === "}" && --depth === 0) { break; }
        }
        if (depth !== 0) {
            throw new Error("Unable to separate generated classes.");
        }
        classes.push({ name: match[1], source: source.slice(match.index, end + 1) });
        classPattern.lastIndex = end + 1;
    }
    if (classes.length !== tableCount + 1) {
        throw new Error("The model does not contain an exportable table.");
    }

    const namespaceMatch = source.match(/^namespace\s+([^\r\n]+)/m);
    if (!namespaceMatch) {
        throw new Error("Unable to determine the generated namespace.");
    }

    const usedNames = new Set();
    const files = [];
    const createFile = (classInfo) => {
        const filename = this.createUniqueCsFilename(classInfo.name, usedNames);
        const body = classInfo.source.split("\n").map((line) => line.replace(/^    /, "")).join("\n");
        files.push({
            name: filename,
            contents: "using System;\nusing Microsoft.EntityFrameworkCore;\n\nnamespace " + namespaceMatch[1].trim() + "\n{\n" +
                body.split("\n").map((line) => "    " + line).join("\n") + "\n}\n",
        });
    };

    createFile(classes[classes.length - 1]);
    for (const entity of classes.slice(0, -1)) {
        createFile(entity);
    }
    files.contextName = contextName;
    return files;
};

SQL.IO.prototype.createUniqueCsFilename = function (className, usedNames) {
    let baseName = className.replace(/^@/, "").replace(/[^A-Za-z0-9_-]/g, "_") || "Entity";
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(baseName)) {
        baseName = "_" + baseName;
    }
    let filename = baseName + ".cs";
    let suffix = 2;
    while (usedNames.has(filename.toLowerCase())) {
        filename = baseName + "-" + suffix++ + ".cs";
    }
    usedNames.add(filename.toLowerCase());
    return filename;
};

SQL.IO.prototype.downloadEfZip = function (archive, contextName) {
    const name = this.createUniqueCsFilename(contextName, new Set()).replace(/\.cs$/, ".zip");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(archive);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
};

SQL.IO.prototype.serversave = function (e, keyword) {
    if (!this._serverAvailable) return;
    const name = keyword || this.dom.serverloadname.value.trim() || prompt(_("serversaveprompt"), this._name);
    if (!name) {
        return;
    }
    if (name !== this._name) this._serverGrants = [];
    this._name = name;
    this.dom.serverloadname.value = name;
    const xml = this.owner.toXML(true);
    const bp = this.owner.getOption("xhrpath");
    const url =
        bp +
        "backend/" +
        this.dom.backend.value +
        "/save/?keyword=" +
        encodeURIComponent(name);
    this.owner.window.showThrobber();
    this.owner.setTitle(name);
    this.ensureCsrfToken(() => {
        const h = this.owner.getXhrHeaders();
        h["X-CSRF-TOKEN"] = this._csrfToken;
        h["Content-type"] = "application/xml";
        SQL.request(url, this.saveresponse, {
            xml: true,
            method: "post",
            data: xml,
            headers: h,
        });
    }, () => {
        this.owner.window.hideThrobber();
        alert("Unable to obtain a CSRF token. The save was not sent.");
    });
};

SQL.IO.prototype.quicksave = function (e) {
    this.serversave(e, this._name);
};

SQL.IO.prototype.serverload = function (e, keyword, version, ownerId, globalOwner) {
    if (!this._serverAvailable) return;
    if (typeof keyword === "undefined") {
        keyword = this.dom.serverloadmodel.value || this.dom.serverloadname.value.trim();
        if (keyword) {
            version = this.dom.serverloadversion.value === "" ? null : Number(this.dom.serverloadversion.value);
            const selectedOwner = this.dom.serverowner.options[this.dom.serverowner.selectedIndex];
            globalOwner = this.dom.serverowner.selectedIndex > 0
                && selectedOwner.dataset.globalOwner === "true";
            ownerId = this.dom.serverowner.selectedIndex > 0 && !globalOwner
                ? this.dom.serverowner.value
                : null;
        }
    }
    const name = keyword || prompt(_("serverloadprompt"), this.dom.serverloadname.value.trim() || this._name);
    if (!name) {
        return;
    }
    const bp = this.owner.getOption("xhrpath");
    let url =
        bp +
        "backend/" +
        this.dom.backend.value +
        "/load/?keyword=" +
        encodeURIComponent(name);
    if (version !== null && version !== undefined) {
        url += "&version=" + encodeURIComponent(version);
    }
    if (globalOwner) {
        url += "&globalOwner=true";
    } else if (ownerId !== null && ownerId !== undefined) {
        url += "&ownerId=" + encodeURIComponent(ownerId);
    }
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    this._pendingName = name;
    SQL.request(url, this.loadresponse, { xml: true, headers: h });
};

SQL.IO.prototype.serverlist = function (e, preserveOutput, after) {
    if (!this._serverAvailable) return;
    if (preserveOutput) {
        this.setActionLabel("serverlist", "");
    }
    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/list";
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    const callback = (data, code, headers) => {
        this.listresponse(data, code, headers, true);
        if (after) {
            after();
        }
    };
    SQL.request(url, callback, { headers: h });
};

SQL.IO.prototype.updateServerModelControls = function () {
    const ownerControlsEnabled = this._serverModelState === "owned";
    const hasName = this.dom.serverloadname.value.trim().length > 0;
    const hasLoadModel = this.dom.iotype.value === "server"
        ? this.dom.serverloadmodel.value !== ""
        : this.dom.serverloadmodel.value !== "" || hasName;
    const recipient = this.getShareRecipient();
    const hasKnownRecipient = Boolean(
        this.dom.serverknownuser.value || this.dom.serverknowngroup.value);
    this.dom.servershare.disabled = !ownerControlsEnabled || !recipient;
    this.dom.serverunshare.disabled = !ownerControlsEnabled || !hasKnownRecipient;
    this.dom.servergrantid.disabled = !ownerControlsEnabled;
    this.dom.servergrantgroup.disabled = !ownerControlsEnabled || this._currentGroups.length === 0;
    this.dom.serverknownuser.disabled = !ownerControlsEnabled
        || !this._serverGrants.some((grant) => grant.targetType === "User");
    this.dom.serverknowngroup.disabled = !ownerControlsEnabled
        || !this._serverGrants.some((grant) => grant.targetType === "Group");
    this.dom.ioload.disabled = !hasLoadModel;
    this.dom.iosave.disabled = !hasName;
};

SQL.IO.prototype.updateServerModelChoices = function (preferSelectedOwner) {
    const name = this.dom.serverloadmodel.value || "";
    const allMatches = this._serverModels.filter((model) => model.keyword === name);
    const ownerIds = Array.from(new Set(allMatches.map((model) => model.ownerId)));
    const selectedOption = this.dom.serverowner.options[this.dom.serverowner.selectedIndex];
    const selectedOptionOwner = selectedOption && selectedOption.dataset.globalOwner === "true"
        ? null
        : this.dom.serverowner.value;
    const selectedOwner = preferSelectedOwner
        && this.dom.serverowner.selectedIndex > 0
        && ownerIds.indexOf(selectedOptionOwner) !== -1
        ? selectedOptionOwner
        : (ownerIds.indexOf(this._currentOwnerId) !== -1
            ? this._currentOwnerId
            : (ownerIds.length ? ownerIds[0] : null));
    const matches = allMatches.filter((model) => model.ownerId === selectedOwner);
    SQL.dom.clear(this.dom.serverloadmodel);
    const modelNames = Array.from(new Set(this._serverModels.map((model) => model.keyword)));
    const placeholder = SQL.dom.create("option");
    placeholder.value = ""; placeholder.textContent = "";
    this.dom.serverloadmodel.appendChild(placeholder);
    for (const modelName of modelNames) {
        const option = SQL.dom.create("option");
        option.value = modelName;
        option.textContent = modelName;
        option.selected = modelName === name;
        this.dom.serverloadmodel.appendChild(option);
    }
    SQL.dom.clear(this.dom.serverloadversion);
    const latest = SQL.dom.create("option");
    latest.value = ""; latest.textContent = _("serverlatest");
    this.dom.serverloadversion.appendChild(latest);
    for (const model of matches) {
        const option = SQL.dom.create("option");
        option.value = model.version; option.textContent = "v" + model.version;
        this.dom.serverloadversion.appendChild(option);
    }
    SQL.dom.clear(this.dom.serverowner);
    const ownerPlaceholder = SQL.dom.create("option");
    ownerPlaceholder.value = "";
    ownerPlaceholder.textContent = "";
    this.dom.serverowner.appendChild(ownerPlaceholder);
    for (const ownerId of ownerIds) {
        const option = SQL.dom.create("option");
        option.value = ownerId === null ? "" : ownerId;
        if (ownerId === null) {
            option.dataset.globalOwner = "true";
        }
        option.textContent = ownerId === this._currentOwnerId
            ? this._currentOwnerLabel
            : (ownerId === null ? "Public models" : ownerId);
        option.selected = ownerId === selectedOwner;
        this.dom.serverowner.appendChild(option);
    }
    this.dom.serverloadversion.disabled = matches.length === 0;
    this.dom.serverowner.disabled = ownerIds.length === 0;
    this.dom.serverloadmodel.value = name;
    this.updateServerModelControls();
};

SQL.IO.prototype.getShareRecipient = function () {
    const userId = this.dom.servergrantid.value;
    const group = this.dom.servergrantgroup.value;
    if (userId.trim()) return { targetType: "User", targetId: userId };
    if (group.trim()) return { targetType: "Group", targetId: group };
    return null;
};

SQL.IO.prototype.getKnownShareRecipient = function () {
    if (this.dom.serverknownuser.value) {
        return { targetType: "User", targetId: this.dom.serverknownuser.value };
    }
    if (this.dom.serverknowngroup.value) {
        return { targetType: "Group", targetId: this.dom.serverknowngroup.value };
    }
    return null;
};

SQL.IO.prototype.refreshShareState = function () {
    if (!this._serverAvailable) return;
    if (this._serverModelState !== "owned" || !this._name) {
        this._serverGrants = [];
        this.refreshGrantChoices();
        this.updateServerModelControls();
        return;
    }
    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/access?keyword=" + encodeURIComponent(this._name);
    SQL.request(url, (data, code) => {
        if (!this.check(code) || code < 200 || code >= 300) {
            this._serverGrants = [];
            this.updateServerModelControls();
            return;
        }
        try {
            this._serverGrants = JSON.parse(data || "[]");
        } catch (e) {
            this._serverGrants = [];
        }
        this.refreshGrantChoices();
        this.updateServerModelControls();
    }, { headers: this.owner.getXhrHeaders() });
};

SQL.IO.prototype.refreshGrantChoices = function () {
    SQL.dom.clear(this.dom.serverknownuser);
    SQL.dom.clear(this.dom.serverknowngroup);
    for (const type of ["User", "Group"]) {
        const select = type === "User" ? this.dom.serverknownuser : this.dom.serverknowngroup;
        const placeholder = SQL.dom.create("option");
        placeholder.value = "";
        placeholder.textContent = "";
        select.appendChild(placeholder);
        this._serverGrants.filter((grant) => grant.targetType === type).forEach((grant) => {
            const option = SQL.dom.create("option");
            option.value = grant.targetId;
            option.textContent = grant.targetId;
            select.appendChild(option);
        });
        select.disabled = this._serverModelState !== "owned"
            || !this._serverGrants.some((grant) => grant.targetType === type);
    }
};

SQL.IO.prototype.copyCurrentOwnerId = function () {
    if (!this._serverAvailable) return;
    this.setActionLabel("servercopy", "");
    if (!this._currentOwnerId) {
        this.serverlist(null, true, () => {
            if (this._currentOwnerId) {
                this.copyCurrentOwnerId();
                return;
            }
            alert("Your user ID is not available.");
        });
        return;
    }
    const copied = () => this.setActionLabel("servercopy", _("servercopied"));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this._currentOwnerId).then(copied).catch(() => {
            this.copyTextFallback(this._currentOwnerId, copied);
        });
        return;
    }
    this.copyTextFallback(this._currentOwnerId, copied);
};

SQL.IO.prototype.copyTextFallback = function (value, callback) {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (copied) {
        callback();
    } else {
        alert("Unable to copy the user ID.");
    }
};

SQL.IO.prototype.servershare = function () {
    if (!this._serverAvailable) return;
    if (this._serverModelState !== "owned" || !this._name) {
        return;
    }

    const recipient = this.getShareRecipient();
    if (!recipient) {
        alert(_("serverrecipientrequired"));
        return;
    }

    const bp = this.owner.getOption("xhrpath");
    const isGranted = this._serverGrants.some((grant) =>
        grant.targetType === recipient.targetType && grant.targetId === recipient.targetId);
    if (isGranted) {
        this.serverunshare();
        return;
    }
    const url = bp + "backend/" + this.dom.backend.value + "/access/grant/?keyword=" + encodeURIComponent(this._name);
    this.ensureCsrfToken(() => {
        const headers = this.owner.getXhrHeaders();
        headers["Content-type"] = "application/json";
        if (this._csrfToken) {
            headers["X-CSRF-TOKEN"] = this._csrfToken;
        }
        SQL.request(url, (data, code, responseHeaders) => {
            this.setCsrfToken(responseHeaders);
            if (code === 204) {
                alert(_("serversharegranted"));
                this.refreshShareState();
            } else {
                this.check(code);
            }
        }, {
            method: "post",
            data: JSON.stringify({ targetType: recipient.targetType, targetId: recipient.targetId, permission: "View" }),
            headers: headers
        });
    }, () => {
        alert(_("serversharecsrffailure"));
    });
};

SQL.IO.prototype.serverunshare = function () {
    if (!this._serverAvailable) return;
    if (this._serverModelState !== "owned" || !this._name) {
        return;
    }

    const recipient = this.getKnownShareRecipient();
    if (!recipient) {
        alert(_("serverrecipientrequired"));
        return;
    }

    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/access/grant/?keyword="
        + encodeURIComponent(this._name) + "&targetType=" + encodeURIComponent(recipient.targetType)
        + "&targetId=" + encodeURIComponent(recipient.targetId);
    this.ensureCsrfToken(() => {
        const headers = this.owner.getXhrHeaders();
        headers["X-CSRF-TOKEN"] = this._csrfToken;
        SQL.request(url, (data, code, responseHeaders) => {
            this.setCsrfToken(responseHeaders);
            if (code === 204) {
                alert(_("servershareremoved"));
                this.refreshShareState();
            } else {
                this.check(code);
            }
        }, { method: "delete", headers: headers });
    }, () => {
        alert(_("serverunsharecsrffailure"));
    });
};

SQL.IO.prototype.serverimport = function (e) {
    if (!this._serverAvailable) return;
    const name = this.dom.serverimportdatabase.value.trim();
    if (!name) {
        return;
    }
    const bp = this.owner.getOption("xhrpath");
    const url =
        bp +
        "backend/" +
        this.dom.backend.value +
        "/import/?database=" +
        name;
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    SQL.request(url, this.importresponse, { xml: true, headers: h });
};

SQL.IO.prototype.check = function (code) {
    switch (code) {
        case 401:
            if (window.__wwwSqlSetAuthenticationState) {
                window.__wwwSqlSetAuthenticationState(true, false);
            } else {
                this.setAuthenticationState(false, false);
            }
            alert(_("httpresponse") + ": HTTP 401 - authentication required");
            return false;
        case 403:
            alert(_("httpresponse") + ": HTTP 403 - access denied");
            return false;
        case 400:
        case 409:
        case 201:
        case 404:
        case 500:
        case 501:
        case 503:
            const lang = "http" + code;
            alert(_("httpresponse") + ": " + _(lang));
            return false;
        default:
            return true;
    }
};

SQL.IO.prototype.saveresponse = function (data, code, headers) {
    this.setCsrfToken(headers);
    this.owner.window.hideThrobber();
    if (this.check(code) && code >= 200 && code < 300) {
        this._serverModelState = "owned";
        this.updateServerModelControls();
        this.refreshShareState();
    }
};

SQL.IO.prototype.loadresponse = function (data, code, headers) {
    this.setCsrfToken(headers);
    const copyable = headers && (headers["X-MODEL-COPYABLE"] || headers["x-model-copyable"]) === "true";
    this.owner.window.hideThrobber();
    if (!this.check(code) || code < 200 || code >= 300) {
        return;
    }
    if (!this.fromXML(data)) {
        return;
    }
    this._name = this._pendingName;
    this.name = this._pendingName;
    this.dom.serverloadname.value = this._pendingName;
    this.dom.serverloadmodel.value = this._pendingName;
    this._serverModelState = copyable ? "copyable" : "owned";
    this.updateServerModelControls();
    this.owner.setTitle(this.name);
    this.refreshShareState();
};

SQL.IO.prototype.listresponse = function (data, code, headers, preserveOutput) {
    this.setCsrfToken(headers);
    this.owner.window.hideThrobber();
    if (!this.check(code) || code < 200 || code >= 300) {
        return;
    }
    if (!preserveOutput) {
        return;
    }
    if (preserveOutput) this.setActionLabel("serverlist", _("serverrefreshed"));
    let list;
    try {
        list = JSON.parse(data || "{}");
    } catch (e) {
        alert(_("httpresponse") + ": " + e.message);
        return;
    }
    this._currentOwnerId = list.currentOwnerId || "";
    this._currentOwnerLabel = list.currentOwnerLabel || "";
    this._currentGroups = Array.isArray(list.groups) ? list.groups : [];
    SQL.dom.clear(this.dom.servergrantgroup);
    const groupPlaceholder = SQL.dom.create("option");
    groupPlaceholder.value = "";
    groupPlaceholder.textContent = "";
    this.dom.servergrantgroup.appendChild(groupPlaceholder);
    for (const group of this._currentGroups) {
        const option = SQL.dom.create("option");
        option.value = group;
        option.textContent = group;
        this.dom.servergrantgroup.appendChild(option);
    }
    this.dom.servergrantgroup.disabled = this._currentGroups.length === 0;
    this._serverModels = Array.isArray(list.models) ? list.models : [];
    this.updateServerModelChoices();
    this.syncClientColumnHeight();
};

SQL.IO.prototype.importresponse = function (data, code, headers) {
    this.setCsrfToken(headers);
    this.owner.window.hideThrobber();
    if (!this.check(code)) {
        return;
    }
    if (this.fromXML(data)) {
        this._serverModelState = "none";
        this._name = "";
        this.dom.serverloadname.value = "";
        this.dom.serverloadmodel.value = "";
        this.updateServerModelControls();
        this.owner.alignTables();
    }
};

SQL.IO.prototype.press = function (e) {
    if (e.keyCode == 113) {
        this.quicksave(e);
    }
};
