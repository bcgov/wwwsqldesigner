/* --------------------- window ------------ */

SQL.Window = function (owner) {
    this.owner = owner;
    this.dom = {
        container: SQL.dom.get("window"),
        background: SQL.dom.get("background"),
        ok: SQL.dom.get("windowok"),
        cancel: SQL.dom.get("windowcancel"),
        title: SQL.dom.get("windowtitle"),
        content: SQL.dom.get("windowcontent"),
        throbber: SQL.dom.get("throbber"),
    };
    this.dom.ok.value = _("windowok");
    this.dom.cancel.value = _("windowcancel");
    this.dom.throbber.alt = this.dom.throbber.title = _("throbber");
    SQL.events.add(this.dom.ok, "click", this.ok.bind(this));
    SQL.events.add(this.dom.cancel, "click", this.cancel.bind(this));
    SQL.events.add(document, "keydown", this.key.bind(this));

    this.state = 0;
    this.hideThrobber();
};

SQL.Window.prototype.showThrobber = function () {
    this.dom.throbber.style.visibility = "";
};

SQL.Window.prototype.hideThrobber = function () {
    this.dom.throbber.style.visibility = "hidden";
};

SQL.Window.prototype.open = function (title, content, callback, cancelCallback) {
    this.state = 1;
    this.callback = callback;
    this.cancelCallback = cancelCallback;
    while (this.dom.title.childNodes.length > 1) {
        this.dom.title.removeChild(this.dom.title.childNodes[1]);
    }

    if (title) {
        const txt = SQL.dom.text(title);
        this.dom.title.appendChild(txt);
    }
    this.dom.title.style.display = title ? "" : "none";
    this.dom.background.style.visibility = "visible";
    SQL.dom.clear(this.dom.content);
    this.dom.content.appendChild(content);

    this.dom.cancel.style.visibility = this.callback ? "" : "hidden";
    this.dom.container.style.visibility = "visible";

    const formElements = ["input", "select", "textarea"];
    const all = this.dom.container.getElementsByTagName("*");
    for (let elm of all) {
        if (formElements.indexOf(elm.tagName.toLowerCase()) != -1) {
            elm.focus();
            break;
        }
    }
};

SQL.Window.prototype.key = function (e) {
    if (!this.state) {
        return;
    }
    if (e.keyCode == 13) {
        this.ok(e);
    }
    if (e.keyCode == 27) {
        this.cancel();
    }
};

SQL.Window.prototype.ok = function (e) {
    if (!this.callback || this.callback() !== false) {
        this.close();
    }
};

SQL.Window.prototype.close = function () {
    if (!this.state) {
        return;
    }
    this.state = 0;
    this.dom.background.style.visibility = "hidden";
    this.dom.container.style.visibility = "hidden";
};

SQL.Window.prototype.cancel = function () {
    if (!this.state) {
        return;
    }
    const callback = this.cancelCallback;
    this.close();
    if (callback) {
        callback();
    }
};
