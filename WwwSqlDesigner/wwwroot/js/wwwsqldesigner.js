SQL.Designer = function () {
    SQL.Designer = this;

    this.xhrheaders = {};
    this.tables = [];
    this.relations = [];
    this.title = document.title;

    SQL.Visual.apply(this);
    new SQL.Toggle(OZ.$("toggle"));

    this.dom.container = OZ.$("area");
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
    this.requestLanguage();
    this.requestDB();
    this.applyStyle();
};
SQL.Designer.prototype = Object.create(SQL.Visual.prototype);

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
    OZ.Request(url, this.languageResponse.bind(this), {
        method: "get",
        xml: true,
    });
};

SQL.Designer.prototype.languageResponse = function (xmlDoc) {
    if (xmlDoc) {
        const strings = xmlDoc.getElementsByTagName("string");
        for (let string of strings) {
            const n = string.getAttribute("name");
            const v = string.firstChild.nodeValue;
            window.LOCALE[n] = v;
        }
    }
    this.flag--;
    if (!this.flag) {
        this.init2();
    }
};

SQL.Designer.prototype.requestDB = function () {
    /* get datatypes file */
    const db = this.getOption("db");
    const bp = this.getOption("staticpath");
    const url = bp + "db/" + db + "/datatypes.xml";
    OZ.Request(url, this.dbResponse.bind(this), { method: "get", xml: true });
};

SQL.Designer.prototype.dbResponse = function (xmlDoc) {
    if (xmlDoc) {
        window.DATATYPES = xmlDoc.documentElement;
    }
    this.flag--;
    if (!this.flag) {
        this.init2();
    }
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
    this.map = new SQL.Map(this);
    this.rubberband = new SQL.Rubberband(this);
    this.tableManager = new SQL.TableManager(this);
    this.rowManager = new SQL.RowManager(this);
    this.keyManager = new SQL.KeyManager(this);
    this.io = new SQL.IO(this);
    this.options = new SQL.Options(this);
    this.window = new SQL.Window(this);

    this.sync();

    OZ.$("docs").value = _("docs");

    const url = window.location.href;
    const r = url.match(/keyword=([^&]+)/);
    if (r) {
        const keyword = r[1];
        this.io.serverload(false, keyword);
    }
    document.body.style.visibility = "visible";
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
    OZ.$("controls").style.zIndex = max + 5;
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
    this.tableManager.select(false);
    this.rowManager.select(false);
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
    document.cookie = "wwwsqldesigner=" + str + "; path=/";
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
    const win = OZ.DOM.win();
    const avail = win[0] - OZ.$("bar").offsetWidth;
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

SQL.Designer.prototype.findNamedTable = function (name) {
    /* find row specified as table(row) */
    for (let table of this.tables) {
        if (table.getTitle() == name) {
            return table;
        }
    }
};

SQL.Designer.prototype.toXML = function () {
    let xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
    xml += "<!-- SQL XML created by WWW SQL Designer, https://github.com/ondras/wwwsqldesigner/ -->\n";
    xml += "<!-- Active URL: " + location.href + " -->\n";
    xml += "<sql>\n";

    /* serialize datatypes */
    if (window.XMLSerializer) {
        const s = new XMLSerializer();
        xml += s.serializeToString(window.DATATYPES);
    } else if (window.DATATYPES.xml) {
        xml += window.DATATYPES.xml;
    } else {
        alert(_("errorxml") + ": " + e.message);
    }

    for (let table of this.tables) {
        xml += table.toXML();
    }
    xml += "</sql>\n";
    return xml;
};

SQL.Designer.prototype.fromXML = function (node) {
    this.clearTables();
    const types = node.getElementsByTagName("datatypes");
    if (types.length) {
        window.DATATYPES = types[0];
    }
    const tables = node.getElementsByTagName("table");
    for (let table of tables) {
        const t = this.addTable("", 0, 0);
        t.fromXML(table);
    }

    for (let table of this.tables) {
        /* ff one-pixel shift hack */
        table.select();
        table.deselect();
    }

    /* relations */
    const rs = node.getElementsByTagName("relation");
    for (let rel of rs) {
        let tname = rel.getAttribute("table");
        let rname = rel.getAttribute("row");

        const t1 = this.findNamedTable(tname);
        if (!t1) {
            continue;
        }
        const r1 = t1.findNamedRow(rname);
        if (!r1) {
            continue;
        }

        tname = rel.parentNode.parentNode.getAttribute("name");
        rname = rel.parentNode.getAttribute("name");
        const t2 = this.findNamedTable(tname);
        if (!t2) {
            continue;
        }
        const r2 = t2.findNamedRow(rname);
        if (!r2) {
            continue;
        }

        this.addRelation(r1, r2);
    }

    this.sync();
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
