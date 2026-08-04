SQL.IO = function (owner) {
    this.owner = owner;
    this._name = ""; /* last used name with server load/save */
    this.lastUsedName =
        ""; /* last used name with local storage */
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
        "quicksave",
        "serversave",
        "serverload",
        "serverlist",
        "serverimport",
    ];
    for (let id of ids) {
        let elm = OZ.$(id);
        this.dom[id] = elm;
        elm.value = _(id);
    }

    this.dom.quicksave.value += " (F2)";

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
    OZ.Event.add(this.dom.exporttarget, "change", this.refreshExportTargetLabel.bind(this));
    OZ.Event.add(this.dom.clientef, "click", this.clientef.bind(this));
    OZ.Event.add(this.dom.clientefzip, "click", this.clientefzip.bind(this));
    OZ.Event.add(this.dom.quicksave, "click", this.quicksave.bind(this));
    OZ.Event.add(this.dom.serversave, "click", this.serversave.bind(this));
    OZ.Event.add(this.dom.serverload, "click", this.serverload.bind(this));
    OZ.Event.add(this.dom.serverlist, "click", this.serverlist.bind(this));
    OZ.Event.add(this.dom.serverimport, "click", this.serverimport.bind(this));
    OZ.Event.add(document, "keydown", this.press.bind(this));
    this.build();
};

SQL.IO.prototype.hideStatus = function () {
    this.dom.status.style.display = "none";
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

    const selectedTarget = this.dom.exporttarget.value || this.owner.getOption("db");
    OZ.DOM.clear(this.dom.exporttarget);
    for (const target of CONFIG.AVAILABLE_DBS.filter((value, index, values) => values.indexOf(value) === index)) {
        const option = OZ.DOM.elm("option");
        option.value = target;
        option.innerHTML = target;
        option.selected = target === selectedTarget;
        this.dom.exporttarget.appendChild(option);
    }
};

SQL.IO.prototype.click = function () {
    /* open io dialog */
    this.build();
    this.dom.ta.value = "";
    this.refreshExportTargetLabel();
    this.owner.window.open(_("saveload"), this.dom.container);
};

SQL.IO.prototype.refreshExportTargetLabel = function () {
    this.dom.clientsql.value = _("clientsql") + " (" + this.getExportTarget() + ")";
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
        this.fromXML(xmlDoc);
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
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

    this.fromXMLText(xml);
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

    this.fromXMLText(xml);
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
    return this.dom.exporttarget.value || this.owner.getOption("db");
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
    const name = keyword || prompt(_("serversaveprompt"), this._name);
    if (!name) {
        return;
    }
    this._name = name;
    const xml = this.owner.toXML(true);
    const bp = this.owner.getOption("xhrpath");
    const url =
        bp +
        "backend/" +
        this.dom.backend.value +
        "/save/?keyword=" +
        encodeURIComponent(name);
    const h = this.owner.getXhrHeaders();
    h["Content-type"] = "application/xml";
    this.owner.window.showThrobber();
    this.owner.setTitle(name);
    OZ.Request(url, this.saveresponse, {
        xml: true,
        method: "post",
        data: xml,
        headers: h,
    });
};

SQL.IO.prototype.quicksave = function (e) {
    this.serversave(e, this._name);
};

SQL.IO.prototype.serverload = function (e, keyword, version) {
    const name = keyword || prompt(_("serverloadprompt"), this._name);
    if (!name) {
        return;
    }
    this._name = name;
    const bp = this.owner.getOption("xhrpath");
    let url =
        bp +
        "backend/" +
        this.dom.backend.value +
        "/load/?keyword=" +
        encodeURIComponent(name);
    if (version) {
        url += "&version=" + encodeURIComponent(version);
    }
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    this.name = name;
    OZ.Request(url, this.loadresponse, { xml: true, headers: h });
};

SQL.IO.prototype.serverlist = function (e) {
    const bp = this.owner.getOption("xhrpath");
    const url = bp + "backend/" + this.dom.backend.value + "/list";
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    OZ.Request(url, this.listresponse, { headers: h });
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

SQL.IO.prototype.saveresponse = function (data, code) {
    this.owner.window.hideThrobber();
    this.check(code);
};

SQL.IO.prototype.loadresponse = function (data, code) {
    this.owner.window.hideThrobber();
    if (!this.check(code)) {
        return;
    }
    this.fromXML(data);
    this.owner.setTitle(this.name);
};

SQL.IO.prototype.listresponse = function (data, code) {
    this.owner.window.hideThrobber();
    if (!this.check(code)) {
        return;
    }
    this.dom.ta.value = data;
};

SQL.IO.prototype.importresponse = function (data, code) {
    this.owner.window.hideThrobber();
    if (!this.check(code)) {
        return;
    }
    if (this.fromXML(data)) {
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
