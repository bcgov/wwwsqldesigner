SQL.Designer = function () {
    SQL.Designer = this;

    this.xhrheaders = {};
    this.tables = [];
    this.relations = [];
    this.title = document.title;

    SQL.Visual.apply(this);
    this.toolbarToggle = new SQL.Toggle(SQL.dom.get("toggle"));

    this.dom.container = SQL.dom.get("area");
    this.minSize = [
        this.dom.container.offsetWidth,
        this.dom.container.offsetHeight,
    ];
    this.width = this.minSize[0];
    this.height = this.minSize[1];

    this.typeIndex = false;
    this.fkTypeFor = false;

    this.vector = this.getOption("vector") && document.createElementNS;
    if (this.vector) {
        this.svgNS = "http://www.w3.org/2000/svg";
        this.dom.svg = document.createElementNS(this.svgNS, "svg");
        this.dom.container.appendChild(this.dom.svg);
    }

    this.flag = 2;
    this.requestEnglishLanguage();
    this.requestDB();
    this.applyStyle();
};
SQL.Designer.prototype = Object.create(SQL.Visual.prototype);
SQL.Designer.prototype.DEFAULT_SCHEMA = "dbo";
SQL.Designer.prototype.effectiveSchema = function (value) {
    const schema = value == null ? "" : String(value).trim();
    return schema || SQL.Designer.DEFAULT_SCHEMA;
};
SQL.Designer.prototype.tableIdentity = function (schema, tableName) {
    return SQL.Designer.effectiveSchema(schema).toLowerCase() + "\u0000" +
        String(tableName == null ? "" : tableName).trim().toLowerCase();
};

/* update area size */
SQL.Designer.prototype.sync = function () {
    let w = this.minSize[0];
    let h = this.minSize[0];
    for (let table of this.tables) {
        w = Math.max(w, table.x + table.width);
        h = Math.max(h, table.y + table.height);
    }

    this.width = w;
    this.height = h;
    this.map.sync();

    if (this.vector) {
        this.dom.svg.setAttribute("width", this.width);
        this.dom.svg.setAttribute("height", this.height);
    }
};

SQL.Designer.prototype.requestLanguage = function () {
    /* get locale file */
    const lang = this.getOption("locale");
    const bp = this.getOption("staticpath");
    const url = bp + "locale/" + lang + ".xml";
    SQL.request(url, this.languageResponse.bind(this), {
        method: "get",
        xml: true,
    });
};

SQL.Designer.prototype.requestEnglishLanguage = function () {
    if (this.getOption("locale") === CONFIG.DEFAULT_LOCALE) {
        this.requestLanguage();
        return;
    }
    const bp = this.getOption("staticpath");
    SQL.request(bp + "locale/" + CONFIG.DEFAULT_LOCALE + ".xml", (xmlDoc) => {
        this.loadLanguage(xmlDoc);
        this.requestLanguage();
    }, {
            method: "get",
            xml: true,
        });
};

SQL.Designer.prototype.loadLanguage = function (xmlDoc) {
    if (xmlDoc) {
        const strings = xmlDoc.getElementsByTagName("string");
        for (let string of strings) {
            const n = string.getAttribute("name");
            const v = string.firstChild.nodeValue;
            window.LOCALE[n] = v;
        }
    }
};

SQL.Designer.prototype.languageResponse = function (xmlDoc) {
    this.loadLanguage(xmlDoc);
    this.flag--;
    if (!this.flag) {
        this.init2();
    }
};

SQL.Designer.prototype.requestDB = function () {
    /* The editor always uses the canonical portable registry. */
    this.dbResponse(null);
};

SQL.Designer.prototype.dbResponse = function (xmlDoc) {
    window.DATATYPES = SQL.PortableTypes.registry();
    this.flag--;
    if (!this.flag) { this.init2(); }
};

SQL.Designer.prototype.applyStyle = function () {
    /* apply style */
    const style = this.getOption("style");
    let i,
        link_elms = document.querySelectorAll("link");
    for (i = 0; i < link_elms.length; i++) {
        if (
            link_elms[i].getAttribute("rel").indexOf("style") != -1 &&
            link_elms[i].getAttribute("title")
        ) {
            link_elms[i].disabled = true;
            if (link_elms[i].getAttribute("title") == style)
                link_elms[i].disabled = false;
        }
    }
};

SQL.Designer.prototype.init2 = function () {
    /* secondary init, after locale & datatypes were retrieved */
    this.mapTools = new SQL.MapTools(this);
    this.legend = new SQL.Legend(this);
    this.map = new SQL.Map(this);
    this.mapTools.sync();
    this.rubberband = new SQL.Rubberband(this);
    this.tableManager = new SQL.TableManager(this);
    this.rowManager = new SQL.RowManager(this);
    this.keyManager = new SQL.KeyManager(this);
    this.io = new SQL.IO(this);
    this.options = new SQL.Options(this);
    this.window = new SQL.Window(this);

    this.sync();

    const url = window.location.href;
    const regexKeyword = url.match(/keyword=([^&]+)/);
    const regexVersion = url.match(/version=([^&]+)/);
    const regexOwnerId = url.match(/ownerId=([^&]+)/);
    const regexGlobalOwner = url.match(/globalOwner=([^&]+)/);
    this._serverDeepLink = regexKeyword ? {
        keyword: decodeURIComponent(regexKeyword[1]),
        version: regexVersion ? decodeURIComponent(regexVersion[1]) : null,
        ownerId: regexOwnerId ? decodeURIComponent(regexOwnerId[1]) : null,
        globalOwner: regexGlobalOwner
            ? decodeURIComponent(regexGlobalOwner[1]) === "true"
            : false
    } : null;
    this._serverDeepLinkLoaded = false;
    this.io.updateServerUi();
    this.loadServerDeepLink();
    document.body.style.visibility = "visible";
};

SQL.Designer.prototype.loadServerDeepLink = function () {
    if (!this.io || !this.io._serverAvailable || !this._serverDeepLink || this._serverDeepLinkLoaded) {
        return;
    }
    this._serverDeepLinkLoaded = true;
    const link = this._serverDeepLink;
    this.io.serverload(false, link.keyword, link.version, link.ownerId, link.globalOwner);
};

SQL.Designer.prototype.getMaxZ = function () {
    /* find max zIndex */
    let max = 0;
    for (let table of this.tables) {
        const z = table.getZ();
        if (z > max) {
            max = z;
        }
    }
    SQL.dom.get("controls").style.zIndex = max + 5;
    return max;
};

SQL.Designer.prototype.addTable = function (name, x, y) {
    const max = this.getMaxZ();
    const t = new SQL.Table(this, name, x, y, max + 1);
    this.tables.push(t);
    this.dom.container.appendChild(t.dom.container);
    return t;
};

SQL.Designer.prototype.removeTable = function (t) {
    const idx = this.tables.indexOf(t);
    if (idx == -1) {
        return;
    }
    t.destroy();
    this.tables.splice(idx, 1);
};

SQL.Designer.prototype.addRelation = function (row1, row2) {
    const r = new SQL.Relation(this, row1, row2);
    this.relations.push(r);
    return r;
};

SQL.Designer.prototype.removeRelation = function (r) {
    const idx = this.relations.indexOf(r);
    if (idx == -1) {
        return;
    }
    r.destroy();
    this.relations.splice(idx, 1);
};

SQL.Designer.prototype.getCookie = function () {
    const c = document.cookie;
    let obj = {};
    const parts = c.split(";");
    for (let part of parts) {
        const r = part.match(/wwwsqldesigner={(.*?)}/);
        if (r) {
            const options = r[1].split(",");
            for (let option of options) {
                const opt = option.match(/(.*):'(.*)'/);
                if (opt) {
                    obj[opt[1]] = opt[2];
                }
            }
        }
    }
    return obj;
};

SQL.Designer.prototype.setCookie = function (obj) {
    const arr = [];
    for (let p in obj) {
        arr.push(p + ":'" + obj[p] + "'");
    }
    const str = "{" + arr.join(",") + "}";
    document.cookie = "wwwsqldesigner=" + str + ";samesite=strict;secure";
};

SQL.Designer.prototype.getOption = function (name) {
    const c = this.getCookie();
    if (name in c) {
        return c[name];
    }
    /* defaults */
    switch (name) {
        case "locale":
            return CONFIG.DEFAULT_LOCALE;
        case "db":
            return CONFIG.DEFAULT_DB;
        case "lastExportTarget":
            return CONFIG.DEFAULT_DB;
        case "efnamespace":
            return CONFIG.EF_DEFAULT_NAMESPACE;
        case "efcontext":
            return CONFIG.EF_DEFAULT_CONTEXT;
        case "staticpath":
            return CONFIG.STATIC_PATH || "";
        case "xhrpath":
            return CONFIG.XHR_PATH || "";
        case "snap":
            return 0;
        case "showsize":
            return 0;
        case "showtype":
            return 0;
        case "pattern":
            return "%R_%T";
        case "hide":
            return false;
        case "vector":
            return true;
        case "style":
            return "material-inspired";
        default:
            return null;
    }
};

SQL.Designer.prototype.setOption = function (name, value) {
    const obj = this.getCookie();
    obj[name] = value;
    this.setCookie(obj);
};

SQL.Designer.prototype.getXhrHeaders = function (value) {
    return this.xhrheaders;
};

SQL.Designer.prototype.setXhrHeaders = function (value) {
    this.xhrheaders = value;
};

SQL.Designer.prototype.raise = function (table) {
    /* raise a table */
    const old = table.getZ();
    const max = this.getMaxZ();
    table.setZ(max);
    for (let t of this.tables) {
        if (t == table) {
            continue;
        }
        if (t.getZ() > old) {
            t.setZ(t.getZ() - 1);
        }
    }
    const m = table.dom.mini;
    m.parentNode.appendChild(m);
};

SQL.Designer.prototype.clearTables = function () {
    while (this.tables.length) {
        this.removeTable(this.tables[0]);
    }
    this.setTitle(false);
};

SQL.Designer.prototype.alignTables = function () {
    const win = SQL.dom.win();
    const avail = win[0] - SQL.dom.get("bar").offsetWidth;
    let x = 10;
    let y = 10;
    let max = 0;

    this.tables.sort(function (a, b) {
        return b.getRelations().length - a.getRelations().length;
    });

    for (let table of this.tables) {
        const w = table.dom.container.offsetWidth;
        const h = table.dom.container.offsetHeight;
        if (x + w > avail) {
            x = 10;
            y += 10 + max;
            max = 0;
        }
        table.moveTo(x, y);
        x += 10 + w;
        if (h > max) {
            max = h;
        }
    }

    this.sync();
};

SQL.Designer.prototype.findTable = function (schema, name) {
    const identity = SQL.Designer.tableIdentity(schema, name);
    const matches = this.tables.filter((table) =>
        SQL.Designer.tableIdentity(table.getSchema(), table.getTitle()) === identity);
    return matches.length === 1 ? matches[0] : undefined;
};

SQL.Designer.prototype.toXML = function (recordSave) {
    if (recordSave) { this.legend.prepareForSave(); }
    let xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
    xml += "<!-- SQL XML created by WWW SQL Designer, https://github.com/ondras/wwwsqldesigner/ -->\n";
    xml += '<sql format="portable-v1">\n' + this.legend.toXML();
    xml += new XMLSerializer().serializeToString(SQL.PortableTypes.registry());
    for (let table of this.tables) { xml += table.toXML(); }
    xml += "</sql>\n";
    if (recordSave) { this.legend.rememberSaved(xml); }
    return xml;
};

SQL.Designer.prototype.directChildren = function (node, name) {
    return Array.from(node.children || []).filter((child) =>
        child.tagName && child.tagName.toLowerCase() === name);
};
SQL.Designer.prototype.directChild = function (node, name) {
    return SQL.Designer.directChildren(node, name)[0] || null;
};

SQL.Designer.prototype.preparePortableImport = function (node) {
    const copy = node.cloneNode(true);
    const types = SQL.Designer.directChildren(copy, "datatypes");
    const currentDb = window.DATATYPES.getAttribute("db");
    const sourceDb = types.length ? types[0].getAttribute("db") : (currentDb === "portable" ? CONFIG.DEFAULT_DB : currentDb);
    const isPortable = copy.getAttribute("format") === SQL.PortableTypes.format || (sourceDb || "").toLowerCase() === "portable";
    const diagnostics = [];
    for (const table of SQL.Designer.directChildren(copy, "table")) {
      for (const row of SQL.Designer.directChildren(table, "row")) {
        const datatype = SQL.Designer.directChild(row, "datatype");
        if (!datatype) { continue; }
        const original = datatype.textContent.trim();
        let type = isPortable ? SQL.PortableTypes.canonical(original) : SQL.PortableTypes.source(sourceDb, original);
        if (!type) {
            const label = original || "(empty type)";
            type = { kind: "text", facets: "", diagnostics: [label + " is not a portable type and is imported as text."] };
        }
        datatype.textContent = SQL.PortableTypes.formatToken(type);
        if (type.diagnostics) { diagnostics.push.apply(diagnostics, type.diagnostics); }
      }
    }
    copy.setAttribute("format", SQL.PortableTypes.format);
    return { node: copy, diagnostics: diagnostics };
};
SQL.Designer.prototype.validatePortableImport = function (prepared) {
    const portable = prepared.node;
    if (!portable.tagName || portable.tagName.toLowerCase() !== "sql") {
        throw new Error("Invalid model root: expected sql.");
    }
    const allowedParents = {
        datatypes: ["sql"], legend: ["sql"], table: ["sql"], row: ["table"],
        key: ["table"], comment: ["table", "row"], classification: ["row"], datatype: ["row"],
        default: ["row"], relation: ["row"], part: ["key"], "records-schedule": ["table"]
    };
    const singletons = { sql: ["datatypes", "legend"], table: ["comment", "records-schedule"], row: ["datatype", "default", "comment", "classification"] };
    for (const element of [portable].concat(Array.from(portable.querySelectorAll("*")))) {
        const name = element.tagName.toLowerCase();
        if ((name === "comment" || name === "records-schedule") && element.tagName !== name) {
            throw new Error("Invalid model element case: " + name + ".");
        }
        if (name === "classification" && element.tagName !== "classification") {
            throw new Error("Invalid model element case: classification.");
        }
        if (name === "sql" && element !== portable) {
            throw new Error("Misplaced model element: sql.");
        }
        if (allowedParents[name]) {
            const parentName = element.parentElement && element.parentElement.tagName.toLowerCase();
            if (allowedParents[name].indexOf(parentName) === -1) {
                throw new Error("Misplaced model element: " + name + ".");
            }
        }
        for (const childName of singletons[name] || []) {
            if (SQL.Designer.directChildren(element, childName).length > 1) {
                throw new Error("Duplicate model element: " + childName + ".");
            }
        }
        if (name === "default" && element.childNodes.length &&
            (element.childNodes.length !== 1 || element.firstChild.nodeType !== Node.TEXT_NODE)) {
            throw new Error("Default must contain exactly one text node.");
        }
        if ((name === "comment" || name === "records-schedule") && element.childNodes.length &&
            (element.childNodes.length !== 1 || element.firstChild.nodeType !== Node.TEXT_NODE)) {
            throw new Error(name + " must contain exactly one text node.");
        }
        if (name === "classification") {
            if (element.childNodes.length !== 1 || element.firstChild.nodeType !== Node.TEXT_NODE) {
                throw new Error("Classification must contain exactly one text node.");
            }
            const value = element.firstChild.nodeValue;
            if (["Public", "Protected A", "Protected B", "Protected C"].indexOf(value) === -1) {
                throw new Error("Invalid column classification.");
            }
        }
    }
    const tables = SQL.Designer.directChildren(portable, "table");
    const identities = new Map();
    const rowMaps = new Map();
    for (const table of tables) {
        const tableName = table.getAttribute("name");
        if (tableName === null || !String(tableName).trim().length) {
            throw new Error("Table name cannot be empty.");
        }
        const schema = SQL.Designer.effectiveSchema(table.getAttribute("schema"));
        table.setAttribute("schema", schema);
        const identity = SQL.Designer.tableIdentity(schema, tableName);
        if (identities.has(identity)) {
            throw new Error("Duplicate table identity: [" + schema + "].[" + table.getAttribute("name") + "].");
        }
        identities.set(identity, table);
        const rows = new Map();
        for (const row of SQL.Designer.directChildren(table, "row")) {
            const name = row.getAttribute("name") || "";
            if (!name.length) {
                throw new Error("Row name cannot be empty.");
            }
            if (rows.has(name)) {
                throw new Error("Duplicate row name: " + name + ".");
            }
            rows.set(name, row);
        }
        rowMaps.set(table, rows);
        for (const key of SQL.Designer.directChildren(table, "key")) {
            const parts = SQL.Designer.directChildren(key, "part");
            if (!parts.length) {
                throw new Error("Key must contain at least one part.");
            }
            const partNames = new Set();
            for (const part of parts) {
                if (part.childNodes.length !== 1 || part.firstChild.nodeType !== Node.TEXT_NODE) {
                    throw new Error("Key part must contain exactly one text node.");
                }
                const name = part.firstChild.nodeValue;
                if (!name.length) {
                    throw new Error("Key part cannot be empty.");
                }
                if (partNames.has(name)) {
                    throw new Error("Duplicate key part: " + name + ".");
                }
                partNames.add(name);
                if (!rows.has(name)) {
                    throw new Error("Key part row not found: " + name + ".");
                }
            }
        }
    }
    for (const sourceTable of tables) {
        const rows = SQL.Designer.directChildren(sourceTable, "row");
        for (const sourceRow of rows) {
            const relations = SQL.Designer.directChildren(sourceRow, "relation");
            for (const relation of relations) {
                const schema = SQL.Designer.effectiveSchema(relation.getAttribute("schema"));
                relation.setAttribute("schema", schema);
                const target = identities.get(SQL.Designer.tableIdentity(schema, relation.getAttribute("table")));
                if (!target) {
                    throw new Error("Relationship target table not found: [" + schema + "].[" + relation.getAttribute("table") + "].");
                }
                if (!rowMaps.get(target).has(relation.getAttribute("row"))) {
                    throw new Error("Relationship target row not found: [" + schema + "].[" +
                        target.getAttribute("name") + "].[" + relation.getAttribute("row") + "].");
                }
            }
        }
    }
    return prepared;
};
SQL.Designer.prototype.fromXML = function (node) {
    const prepared = this.validatePortableImport(this.preparePortableImport(node));
    const portable = prepared.node;
    this.rowManager.discardSelection();
    this.tableManager.select(false);
    this.clearTables();
    window.DATATYPES = SQL.PortableTypes.registry();
    this.typeIndex = false;
    this.fkTypeFor = false;
    const legends = SQL.Designer.directChildren(portable, "legend");
    this.legend.fromXML(legends.length ? legends[0] : null);
    const tables = SQL.Designer.directChildren(portable, "table");
    for (let table of tables) { const t = this.addTable("", 0, 0); t.fromXML(table); }
    for (let table of this.tables) { table.select(); table.deselect(); }
    const rs = tables.flatMap((table) => SQL.Designer.directChildren(table, "row")
        .flatMap((row) => SQL.Designer.directChildren(row, "relation")));
    for (let rel of rs) {
        let t1 = this.findTable(rel.getAttribute("schema"), rel.getAttribute("table"));
        let r1 = t1 && t1.findNamedRow(rel.getAttribute("row"));
        let t2 = this.findTable(rel.parentNode.parentNode.getAttribute("schema"), rel.parentNode.parentNode.getAttribute("name"));
        let r2 = t2 && t2.findNamedRow(rel.parentNode.getAttribute("name"));
        if (r1 && r2) { const relation = this.addRelation(r1, r2); relation.name = rel.getAttribute("name") || ""; relation.redraw(); }
    }
    this.sync();
    this.legend.rememberSaved(this.toXML());
    return true;
};
SQL.Designer.prototype.setTitle = function (t) {
    document.title = this.title + (t ? " - " + t : "");
};

SQL.Designer.prototype.removeSelection = function () {
    const sel = window.getSelection ? window.getSelection() : document.selection;
    if (!sel) {
        return;
    }
    if (sel.empty) {
        sel.empty();
    }
    if (sel.removeAllRanges) {
        sel.removeAllRanges();
    }
};

SQL.Designer.prototype.getTypeIndex = function (label) {
    if (!this.typeIndex) {
        this.typeIndex = {};
        const types = window.DATATYPES.getElementsByTagName("type");
        for (let i = 0; i < types.length; i++) {
            const l = types[i].getAttribute("label");
            if (l) {
                this.typeIndex[l] = i;
            }
        }
    }
    return this.typeIndex[label];
};

SQL.Designer.prototype.getFKTypeFor = function (typeIndex) {
    if (!this.fkTypeFor) {
        this.fkTypeFor = {};
        const types = window.DATATYPES.getElementsByTagName("type");
        for (let i = 0; i < types.length; i++) {
            this.fkTypeFor[i] = i;
            const fk = types[i].getAttribute("fk");
            if (fk) {
                this.fkTypeFor[i] = this.getTypeIndex(fk);
            }
        }
    }
    return this.fkTypeFor[typeIndex];
};
