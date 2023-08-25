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
    OZ.Event.add(this.dom.quicksave, "click", this.quicksave.bind(this));
    OZ.Event.add(this.dom.serversave, "click", this.serversave.bind(this));
    OZ.Event.add(this.dom.serverload, "click", this.serverload.bind(this));
    OZ.Event.add(this.dom.serverlist, "click", this.serverlist.bind(this));
    OZ.Event.add(this.dom.serverimport, "click", this.serverimport.bind(this));
    OZ.Event.add(document, "keydown", this.press.bind(this));
    this.build();
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
};

SQL.IO.prototype.click = function () {
    /* open io dialog */
    this.build();
    this.dom.ta.value = "";
    this.dom.clientsql.value =
        _("clientsql") + " (" + window.DATATYPES.getAttribute("db") + ")";
    this.owner.window.open(_("saveload"), this.dom.container);
};

SQL.IO.prototype.fromXMLText = function (xml) {
    let xmlDoc;
    try {
        if (window.DOMParser) {
            const parser = new DOMParser();
            xmlDoc = parser.parseFromString(xml, "text/xml");
        } else if (window.ActiveXObject || "ActiveXObject" in window) {
            xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.loadXML(xml);
        } else {
            throw new Error("No XML parser available.");
        }
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
        return;
    }
    this.fromXML(xmlDoc);
};

SQL.IO.prototype.fromXML = function (xmlDoc) {
    if (!xmlDoc || !xmlDoc.documentElement) {
        alert(_("xmlerror") + ": Null document");
        return false;
    }
    this.owner.fromXML(xmlDoc.documentElement);
    this.owner.window.close();
    return true;
};

SQL.IO.prototype.clientsave = function () {
    const xml = this.owner.toXML();
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

    const xml = this.owner.toXML();
    if (xml.length >= (5 * 1024 * 1024) / 2) {
        /* this is a very big db structure... */
        alert(
            "Warning: your database structure is above 5 megabytes in size, this is above the localStorage single key limit allowed by some browsers, example Mozilla Firefox 10"
        );
        return;
    }

    let key = this.promptName("serversaveprompt");
    if (!key) {
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
    const path = bp + "db/" + window.DATATYPES.getAttribute("db") + "/output.xsl";
    const h = this.owner.getXhrHeaders();
    this.owner.window.showThrobber();
    OZ.Request(path, this.finish.bind(this), { xml: true, headers: h });
};

SQL.IO.prototype.finish = function (xslDoc) {
    this.owner.window.hideThrobber();
    const xml = this.owner.toXML();
    let sql = "";
    try {
        if (window.XSLTProcessor && window.DOMParser) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, "text/xml");
            const xsl = new XSLTProcessor();
            xsl.importStylesheet(xslDoc);
            const result = xsl.transformToDocument(xmlDoc);
            sql = result.documentElement.textContent;
        } else if (window.ActiveXObject || "ActiveXObject" in window) {
            const xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.loadXML(xml);
            sql = xmlDoc.transformNode(xslDoc);
        } else {
            throw new Error("No XSLT processor available");
        }
    } catch (e) {
        alert(_("xmlerror") + ": " + e.message);
        return;
    }
    this.dom.ta.value = sql.trim();
};

SQL.IO.prototype.serversave = function (e, keyword) {
    const name = keyword || prompt(_("serversaveprompt"), this._name);
    if (!name) {
        return;
    }
    this._name = name;
    const xml = this.owner.toXML();
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
