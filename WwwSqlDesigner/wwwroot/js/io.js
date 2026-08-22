SQL.IO = function (owner) {
    this.owner = owner;
    this._name = ""; /* last used name with server load/save */
    this.lastUsedName =
        ""; /* last used name with local storage */
    this._csrfToken = "";
    this._serverModelState = "none";
    this._serverModels = [];
    this._currentOwnerId = "";
    this._currentOwnerLabel = "";
    this.dom = {
        container: OZ.$("io"),
    };

    let ids = [
        "saveload",
        "clientlocalsave",
        "clientsave",
        "clientlocalload",
        "clientlocallist",
        "clientload",
        "clientsql",
        "clientef",
        "clientefzip",
        "serversave",
        "serverload",
        "serverlist",
        "servershare",
        "serverimport",
    ];
    for (let id of ids) {
        let elm = OZ.$(id);
        this.dom[id] = elm;
        elm.value = _(id);
    }
    ids = ["client", "server", "output", "backendlabel"];
    for (let id of ids) {
        let elm = OZ.$(id);
        elm.innerHTML = _(id);
    }

    this.dom.ta = OZ.$("textarea");
    this.dom.backend = OZ.$("backend");
    this.dom.exporttarget = OZ.$("exporttarget");
    this.dom.exporttargetlabel = OZ.$("exporttargetlabel");
    const exportLabel = _("exporttarget"); this.dom.exporttargetlabel.textContent = exportLabel === "exporttarget" ? "Export target:" : exportLabel;
    this.dom.status = OZ.$("iostatus");
    this.dom.statusmessage = OZ.$("iostatusmessage");
    this.dom.statusdetails = OZ.$("iostatusdetails");
    this.dom.statuslist = OZ.$("iostatuslist");
    this.dom.statusdismiss = OZ.$("iostatusdismiss");
    this.dom.serverloadname = OZ.$("serverloadname");
    this.dom.serverloadmodel = OZ.$("serverloadmodel");
    this.dom.serverloadversion = OZ.$("serverloadversion");
    this.dom.serverowner = OZ.$("serverowner");
    this.dom.serverownercontrol = OZ.$("serverownercontrol");
    this.dom.serverversioncontrol = OZ.$("serverversioncontrol");
    this.dom.servergrantid = OZ.$("servergrantid");
    this.dom.servergrantgroup = OZ.$("servergrantgroup");
    this.dom.servercopyid = OZ.$("servercopyid");
    this.dom.serverpanel = OZ.$("serverpanel");
    this.dom.clientcontent = document.querySelector(".io-client-content");
    this._actionLabelTimers = {};
    this._currentGroups = [];
    this._serverGrants = [];
    this.updateServerModelControls();

    this.dom.container.parentNode.removeChild(this.dom.container);
    this.dom.container.style.visibility = "";

    this.saveresponse = this.saveresponse.bind(this);
    this.loadresponse = this.loadresponse.bind(this);
    this.listresponse = this.listresponse.bind(this);
    this.importresponse = this.importresponse.bind(this);

    OZ.Event.add(this.dom.saveload, "click", this.click.bind(this));
    OZ.Event.add(
        this.dom.clientlocalsave,
        "click",
        this.clientlocalsave.bind(this)
    );
    OZ.Event.add(this.dom.clientsave, "click", this.clientsave.bind(this));
    OZ.Event.add(
        this.dom.clientlocalload,
        "click",
        this.clientlocalload.bind(this)
    );
    OZ.Event.add(
        this.dom.clientlocallist,
        "click",
        this.clientlocallist.bind(this)
    );
    OZ.Event.add(this.dom.clientload, "click", this.clientload.bind(this));
    OZ.Event.add(this.dom.clientsql, "click", this.clientsql.bind(this));
    OZ.Event.add(this.dom.statusdismiss, "click", this.hideStatus.bind(this));
    OZ.Event.add(this.dom.exporttarget, "change", this.changeExportTarget.bind(this));
    OZ.Event.add(this.dom.clientef, "click", this.clientef.bind(this));
    OZ.Event.add(this.dom.clientefzip, "click", this.clientefzip.bind(this));
    OZ.Event.add(this.dom.serversave, "click", this.serversave.bind(this));
    OZ.Event.add(this.dom.serverload, "click", this.serverload.bind(this));
    OZ.Event.add(this.dom.serverlist, "click", () => this.serverlist(null, true));
    OZ.Event.add(this.dom.servershare, "click", this.servershare.bind(this));
    OZ.Event.add(this.dom.servercopyid, "click", this.copyCurrentOwnerId.bind(this));
    OZ.Event.add(this.dom.serverimport, "click", this.serverimport.bind(this));
    OZ.Event.add(this.dom.serverloadname, "input", this.updateServerModelControls.bind(this));
    OZ.Event.add(this.dom.serverloadmodel, "change", this.updateServerModelChoices.bind(this));
    OZ.Event.add(this.dom.servergrantid, "input", () => {
        if (this.dom.servergrantid.value) this.dom.servergrantgroup.value = "";
        this.updateServerModelControls();
    });
    OZ.Event.add(this.dom.servergrantgroup, "change", () => {
        if (this.dom.servergrantgroup.value) this.dom.servergrantid.value = "";
        this.updateServerModelControls();
    });
    OZ.Event.add(this.dom.serverowner, "change", () => this.updateServerModelChoices(true));
    OZ.Event.add(this.dom.backend, "change", this.serverlist.bind(this));
    OZ.Event.add(document, "keydown", this.press.bind(this));
    this.build();
};

SQL.IO.prototype.hideStatus = function () {
    this.dom.status.style.display = "none";
};

SQL.IO.prototype.syncClientColumnHeight = function () {
    this.dom.clientcontent.style.height = this.dom.serverpanel.getBoundingClientRect().height + "px";
};

SQL.IO.prototype.setActionLabel = function (action, label) {
    const button = action === "servercopy" ? this.dom.servercopyid : this.dom.serverlist;
    if (this._actionLabelTimers[action]) {
        clearTimeout(this._actionLabelTimers[action]);
        delete this._actionLabelTimers[action];
    }
    button.textContent = label || (action === "servercopy" ? "Copy" : "Refresh");
    if (label) {
        this._actionLabelTimers[action] = setTimeout(() => {
            button.textContent = action === "servercopy" ? "Copy" : "Refresh";
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
    OZ.Request(url, (data, code, headers) => {
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

SQL.IO.prototype.showStatus = function (diagnostics, operation) {
    const messages = Array.from(new Set(diagnostics || []));
    if (!messages.length) { this.hideStatus(); return; }
    this.dom.statusmessage.textContent = (operation || "Operation") + " reported " + messages.length + " conversion warning" + (messages.length === 1 ? "." : "s.");
    OZ.DOM.clear(this.dom.statuslist);
    messages.forEach((message) => { const item = OZ.DOM.elm("li"); item.textContent = message; this.dom.statuslist.appendChild(item); });
    this.dom.statusdetails.style.display = "";
    this.dom.status.style.display = "block";
};
SQL.IO.prototype.build = function () {
    OZ.DOM.clear(this.dom.backend);

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
        let o = OZ.DOM.elm("option");
        o.value = bs[i];
        o.innerHTML = bs[i];
        this.dom.backend.appendChild(o);
        if (bs[i] == be) {
            this.dom.backend.selectedIndex = i;
        }
    }

    const selectedTarget = this.getExportTarget();
    OZ.DOM.clear(this.dom.exporttarget);
    for (const target of CONFIG.EXPORT_TARGETS) {
        const option = OZ.DOM.elm("option");
        option.value = target.id;
        option.textContent = target.label;
        option.selected = target.id === selectedTarget;
        this.dom.exporttarget.appendChild(option);
    }
};

SQL.IO.prototype.click = function () {
    /* open io dialog */
    this.build();
    this.hideStatus();
    this.dom.ta.value = "";
    this.dom.serverloadname.value = this._name || "";
    this.refreshExportTargetLabel();
    this.owner.window.open("", this.dom.container);
    this.dom.serverloadmodel.focus();
    this.syncClientColumnHeight();
    if (!this._serverModels.length) {
        this.serverlist(null, true);
    }
};

SQL.IO.prototype.refreshExportTargetLabel = function () {
    this.dom.clientsql.value = _("clientsql") + " (" + this.getExportTargetDefinition().label + ")";
};

SQL.IO.prototype.changeExportTarget = function () {
    this.owner.setOption("lastExportTarget", this.getExportTarget());
    this.refreshExportTargetLabel();
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
    try {
        const xmlDoc = this.parseXml(xml);
        return this.fromXML(xmlDoc);
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
        return false;
    }
};

SQL.IO.prototype.fromXML = function (xmlDoc) {
    if (!xmlDoc || !xmlDoc.documentElement) {
        alert(_("xmlerror") + ": Null document");
        return false;
    }
    if (!this.owner.fromXML(xmlDoc.documentElement)) { return false; }
    /* Keep the pane open when conversion warnings need to be read. */
    if (this.dom.status.style.display === "none") { this.owner.window.close(); }
    return true;
};

SQL.IO.prototype.clientsave = function () {
    const xml = this.owner.toXML(true);
    this.dom.ta.value = xml;
};

SQL.IO.prototype.clientload = function () {
    const xml = this.dom.ta.value;
    if (!xml) {
        alert(_("empty"));
        return;
    }

    if (this.fromXMLText(xml)) {
        this._serverModelState = "none";
        this._name = "";
        this.dom.serverloadname.value = "";
        this.updateServerModelControls();
    }
};

SQL.IO.prototype.promptName = function (title, suffix) {
    const lastUsedName = this.owner.getOption("lastUsedName") || this.lastUsedName;
    let name = prompt(_(title), lastUsedName);
    if (!name) {
        return null;
    }
    if (suffix && name.endsWith(suffix)) {
        // remove suffix from name
        name = name.substring(0, name.length - 4);
    }
    this.owner.setOption("lastUsedName", name);
    this.lastUsedName = name; // save this also in variable in case cookies are disabled
    return name;
};

SQL.IO.prototype.clientlocalsave = function () {
    if (!window.localStorage) {
        alert("Sorry, your browser does not seem to support localStorage.");
        return;
    }

    let key = this.promptName("serversaveprompt");
    if (!key) {
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

    key = "wwwsqldesigner_databases_" + (key || "default");

    try {
        localStorage.setItem(key, xml);
        if (localStorage.getItem(key) != xml) {
            throw new Error("Content verification failed");
        }
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

    let key = this.promptName("serverloadprompt");
    if (!key) {
        return;
    }

    key = "wwwsqldesigner_databases_" + (key || "default");

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
        this.dom.serverloadname.value = "";
        this.updateServerModelControls();
    }
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
    const bp = this.owner.getOption("staticpath");
    const target = this.getExportTarget();
    const path = bp + "db/" + target + "/output.xsl";
    const h = this.owner.getXhrHeaders();
    h['transformation'] = target;
    this.owner.window.showThrobber();
    OZ.Request(path, this.finish.bind(this), { xml: true, headers: h });
};

SQL.IO.prototype.clientef = function () {
    const bp = this.owner.getOption("staticpath");
    const path = bp + "db/" + "ef" + "/output.xsl";
    const h = this.owner.getXhrHeaders();
    h['transformation'] = 'ef';
    this.owner.window.showThrobber();
    OZ.Request(path, this.finish.bind(this), { xml: true, headers: h });
};

SQL.IO.prototype.getExportTarget = function () {
    return this.getExportTargetDefinition().id;
};

SQL.IO.prototype.getExportTargetDefinition = function () {
    const selected = this.dom.exporttarget.value || this.owner.getOption("lastExportTarget");
    return CONFIG.EXPORT_TARGETS.find((target) => target.id === selected)
        || CONFIG.EXPORT_TARGETS.find((target) => target.id === CONFIG.DEFAULT_DB);
};

/* Maps a serialized copy only; target selection never rewrites the editor. */
SQL.IO.prototype.getExportXml = function (target) {
    const doc = this.parseXml(this.owner.toXML());
    const diagnostics = [];
    let safe = true;
    for (const row of doc.querySelectorAll("sql > table > row")) {
        const datatype = row.getElementsByTagName("datatype")[0];
        const portable = SQL.PortableTypes.canonical(datatype ? datatype.textContent : "");
        const mapped = portable ? SQL.PortableTypes.map(portable, target) : { safe: false, diagnostics: ["Invalid portable datatype."], type: "" };
        diagnostics.push.apply(diagnostics, mapped.diagnostics);
        safe = safe && mapped.safe;
        if (mapped.safe && datatype) { datatype.textContent = mapped.type; }
    }
    const datatypes = doc.querySelector("sql > datatypes");
    if (datatypes) { datatypes.setAttribute("db", target); }
    return { xml: new XMLSerializer().serializeToString(doc), diagnostics: diagnostics, safe: safe };
};

SQL.IO.prototype.getSafeExportXml = function (target) {
    const mapped = this.getExportXml(target);
    this.showStatus(mapped.diagnostics, "Export");
    return mapped.safe ? mapped.xml : null;
};

SQL.IO.prototype.clientefzip = function () {
    if (typeof JSZip === "undefined") {
        alert(_("efzipexporterror"));
        return;
    }

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
            const zip = new JSZip();
            for (const file of files) {
                zip.file(file.name, file.contents);
            }
            zip.generateAsync({ type: "blob", compression: "DEFLATE" })
                .then((archive) => this.downloadEfZip(archive, files.contextName))
                .catch(() => alert(_("efzipexporterror")))
                .finally(() => this.owner.window.hideThrobber());
        } catch (e) {
            this.owner.window.hideThrobber();
            alert(_("efzipexporterror"));
        }
    });
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
            console.error(err.message);
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
        this.dom.ta.value = this.transformEf(xslDoc, xml, this.owner.getXhrHeaders().transformation === "ef");
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
        for (; end < source.length; end++) {
            if (source[end] === "{") { depth++; }
            if (source[end] === "}" && --depth === 0) { break; }
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
    const name = keyword || this.dom.serverloadname.value.trim() || prompt(_("serversaveprompt"), this._name);
    if (!name) {
        return;
    }
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
        OZ.Request(url, this.saveresponse, {
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

SQL.IO.prototype.serverload = function (e, keyword, version, ownerId) {
    if (typeof keyword === "undefined") {
        keyword = this.dom.serverloadmodel.value;
        if (!keyword) { this.dom.serverloadmodel.focus(); return; }
        version = this.dom.serverloadversion.value === "" ? null : Number(this.dom.serverloadversion.value);
        ownerId = this.dom.serverowner.value || null;
    }
    const name = keyword || prompt(_("serverloadprompt"), this._name);
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
    if (ownerId) {
        url += "&ownerId=" + encodeURIComponent(ownerId);
    }
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    this._pendingName = name;
    OZ.Request(url, this.loadresponse, { xml: true, headers: h });
};

SQL.IO.prototype.serverlist = function (e, preserveOutput) {
    if (preserveOutput) {
        this.setActionLabel("serverlist", "");
    }
    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/list";
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    const callback = preserveOutput
        ? (data, code, headers) => this.listresponse(data, code, headers, true)
        : this.listresponse;
    OZ.Request(url, callback, { headers: h });
};

SQL.IO.prototype.updateServerModelControls = function () {
    const ownerControlsEnabled = this._serverModelState === "owned";
    const hasName = this.dom.serverloadname.value.trim().length > 0;
    const hasLoadModel = this.dom.serverloadmodel.value !== "";
    const recipient = this.getShareRecipient();
    const isGranted = recipient && this._serverGrants.some((grant) =>
        grant.targetType === recipient.targetType && grant.targetId === recipient.targetId);
    this.dom.servershare.disabled = !ownerControlsEnabled || !recipient;
    this.dom.servershare.value = isGranted ? "Unshare" : "Share";
    this.dom.serverload.disabled = !hasLoadModel;
    this.dom.serversave.disabled = !hasName;
};

SQL.IO.prototype.updateServerModelChoices = function (preferSelectedOwner) {
    const name = this.dom.serverloadmodel.value || "";
    const allMatches = this._serverModels.filter((model) => model.keyword === name);
    const ownerIds = Array.from(new Set(allMatches.map((model) => model.ownerId)));
    const selectedOwner = preferSelectedOwner && ownerIds.indexOf(this.dom.serverowner.value) !== -1
        ? this.dom.serverowner.value
        : (ownerIds.indexOf(this._currentOwnerId) !== -1
            ? this._currentOwnerId
            : (ownerIds.length ? ownerIds[0] : ""));
    const matches = allMatches.filter((model) => !selectedOwner || model.ownerId === selectedOwner);
    OZ.DOM.clear(this.dom.serverloadmodel);
    const modelNames = Array.from(new Set(this._serverModels.map((model) => model.keyword)));
    const placeholder = OZ.DOM.elm("option");
    placeholder.value = ""; placeholder.textContent = "";
    this.dom.serverloadmodel.appendChild(placeholder);
    for (const modelName of modelNames) {
        const option = OZ.DOM.elm("option");
        option.value = modelName;
        option.textContent = modelName;
        option.selected = modelName === name;
        this.dom.serverloadmodel.appendChild(option);
    }
    OZ.DOM.clear(this.dom.serverloadversion);
    const latest = OZ.DOM.elm("option");
    latest.value = ""; latest.textContent = "";
    this.dom.serverloadversion.appendChild(latest);
    for (const model of matches) {
        const option = OZ.DOM.elm("option");
        option.value = model.version; option.textContent = "v" + model.version;
        this.dom.serverloadversion.appendChild(option);
    }
    OZ.DOM.clear(this.dom.serverowner);
    const ownerPlaceholder = OZ.DOM.elm("option");
    ownerPlaceholder.value = "";
    ownerPlaceholder.textContent = "";
    this.dom.serverowner.appendChild(ownerPlaceholder);
    for (const ownerId of ownerIds) {
        const option = OZ.DOM.elm("option");
        option.value = ownerId;
        option.textContent = ownerId === this._currentOwnerId
            ? this._currentOwnerLabel
            : (ownerId || "Public models");
        option.selected = ownerId === selectedOwner && selectedOwner !== "";
        this.dom.serverowner.appendChild(option);
    }
    this.dom.serverversioncontrol.style.display = "";
    this.dom.serverownercontrol.style.display = "";
    this.dom.serverversioncontrol.querySelector("select").disabled = matches.length === 0;
    this.dom.serverownercontrol.querySelector("select").disabled = ownerIds.length === 0;
    this.dom.serverloadmodel.value = name;
    this.updateServerModelControls();
};

SQL.IO.prototype.getShareRecipient = function () {
    const userId = this.dom.servergrantid.value.trim();
    const group = this.dom.servergrantgroup.value.trim();
    if (userId) return { targetType: "User", targetId: userId };
    if (group) return { targetType: "Group", targetId: group };
    return null;
};

SQL.IO.prototype.refreshShareState = function () {
    if (this._serverModelState !== "owned" || !this._name) {
        this._serverGrants = [];
        this.updateServerModelControls();
        return;
    }
    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/access?keyword=" + encodeURIComponent(this._name);
    OZ.Request(url, (data, code) => {
        if (code < 200 || code >= 300) {
            this._serverGrants = [];
            this.updateServerModelControls();
            return;
        }
        try {
            this._serverGrants = JSON.parse(data || "[]");
        } catch (e) {
            this._serverGrants = [];
        }
        this.updateServerModelControls();
    }, { headers: this.owner.getXhrHeaders() });
};

SQL.IO.prototype.copyCurrentOwnerId = function () {
    this.setActionLabel("servercopy", "");
    if (!this._currentOwnerId) {
        alert("Your user ID is not available yet. Refresh the models first.");
        return;
    }
    const copied = () => this.setActionLabel("servercopy", "Copied");
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
    if (this._serverModelState !== "owned" || !this._name) {
        return;
    }

    const recipient = this.getShareRecipient();
    if (!recipient) {
        alert("Enter a user ID or select a group.");
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
        OZ.Request(url, (data, code, responseHeaders) => {
            this.setCsrfToken(responseHeaders);
            if (code === 204) {
                alert("Read-only access granted.");
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
        alert("Unable to obtain a CSRF token. The share was not sent.");
    });
};

SQL.IO.prototype.serverunshare = function () {
    if (this._serverModelState !== "owned" || !this._name) {
        return;
    }

    const recipient = this.getShareRecipient();
    if (!recipient) {
        alert("Enter a user ID or select a group.");
        return;
    }

    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/access/grant/?keyword="
        + encodeURIComponent(this._name) + "&targetType=" + encodeURIComponent(recipient.targetType)
        + "&targetId=" + encodeURIComponent(recipient.targetId);
    this.ensureCsrfToken(() => {
        const headers = this.owner.getXhrHeaders();
        headers["X-CSRF-TOKEN"] = this._csrfToken;
        OZ.Request(url, (data, code, responseHeaders) => {
            this.setCsrfToken(responseHeaders);
            if (code === 204) {
                alert("Share removed.");
                this.refreshShareState();
            } else {
                this.check(code);
            }
        }, { method: "delete", headers: headers });
    }, () => {
        alert("Unable to obtain a CSRF token. The share was not removed.");
    });
};

SQL.IO.prototype.serverimport = function (e) {
    const name = prompt(_("serverimportprompt"), "");
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
    OZ.Request(url, this.importresponse, { xml: true, headers: h });
};

SQL.IO.prototype.check = function (code) {
    switch (code) {
        case 403:
            this.dom.ta.value = _("httpresponse") + ": HTTP 403 - access denied";
            return false;
        case 201:
        case 404:
        case 500:
        case 501:
        case 503:
            const lang = "http" + code;
            this.dom.ta.value = _("httpresponse") + ": " + _(lang);
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
    }
};

SQL.IO.prototype.loadresponse = function (data, code, headers) {
    this.setCsrfToken(headers);
    const copyable = headers && (headers["X-MODEL-COPYABLE"] || headers["x-model-copyable"]) === "true";
    this.owner.window.hideThrobber();
    if (!this.check(code)) {
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
    if (preserveOutput ? code < 200 || code >= 300 : !this.check(code)) {
        return;
    }
    if (!preserveOutput) {
        this.dom.ta.value = data;
    }
    if (preserveOutput) this.setActionLabel("serverlist", "Refreshed");
    this._currentOwnerId = headers && (headers["X-MODEL-CURRENT-OWNER-ID"] || headers["x-model-current-owner-id"]) || "";
    this._currentOwnerLabel = headers && (headers["X-MODEL-CURRENT-OWNER-LABEL"] || headers["x-model-current-owner-label"]) || "";
    try {
        this._currentGroups = JSON.parse(headers && (headers["X-MODEL-CURRENT-GROUPS"] || headers["x-model-current-groups"]) || "[]");
    } catch (e) {
        this._currentGroups = [];
    }
    OZ.DOM.clear(this.dom.servergrantgroup);
    const groupPlaceholder = OZ.DOM.elm("option");
    groupPlaceholder.value = "";
    groupPlaceholder.textContent = "";
    this.dom.servergrantgroup.appendChild(groupPlaceholder);
    for (const group of this._currentGroups) {
        const option = OZ.DOM.elm("option");
        option.value = group;
        option.textContent = group;
        this.dom.servergrantgroup.appendChild(option);
    }
    this.dom.servergrantgroup.disabled = this._currentGroups.length === 0;
    this._serverModels = String(data || "").split(/\r?\n/).map((line) => {
        const separator = line.indexOf(" - ");
        if (separator < 0) return null;
        const label = line.substring(0, separator);
        const match = label.match(/^(.*) v(\d+)$/);
        if (!match) return null;
        try {
            const url = new URL(line.substring(separator + 3).trim(), window.location.href);
            return {
                keyword: match[1],
                version: Number(match[2]),
                ownerId: url.searchParams.get("ownerId") || ""
            };
        } catch (_) {
            return null;
        }
    }).filter(Boolean);
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
        if (OZ.opera) {
            e.preventDefault();
        }
        this.quicksave(e);
    }
};
