/* --------------------- options ------------ */

SQL.Options = function (owner) {
    this.owner = owner;
    this.dom = {
        container: SQL.dom.get("optionspanel"),
        btn: SQL.dom.get("options"),
    };
    this.dom.btn.value = _("options");
    this.save = this.save.bind(this);
    this.build();
};

SQL.Options.prototype.build = function () {
    this.dom.optionlocale = SQL.dom.get("optionlocale");
    this.dom.optionefnamespace = SQL.dom.get("optionefnamespace");
    this.dom.optionefcontext = SQL.dom.get("optionefcontext");
    this.dom.optionsnap = SQL.dom.get("optionsnap");
    this.dom.optionpattern = SQL.dom.get("optionpattern");
    this.dom.optionstyle = SQL.dom.get("optionstyle");
    this.dom.optionhide = SQL.dom.get("optionhide");
    this.dom.optionvector = SQL.dom.get("optionvector");
    this.dom.optionshowsize = SQL.dom.get("optionshowsize");
    this.dom.optionshowtype = SQL.dom.get("optionshowtype");

    let ids = [
        "language",
        "efnamespace",
        "efcontext",
        "snap",
        "pattern",
        "style",
        "hide",
        "vector",
        "showsize",
        "showtype",
        "optionsnapnotice",
        "optionpatternnotice",
        "optionsnotice",
    ];
    for (let id of ids) {
        const elm = SQL.dom.get(id);
        elm.innerHTML = _(id);
    }

    const ls = CONFIG.AVAILABLE_LOCALES;
    SQL.dom.clear(this.dom.optionlocale);
    for (let i = 0; i < ls.length; i++) {
        const o = SQL.dom.create("option");
        o.value = ls[i];
        o.innerHTML = ls[i];
        this.dom.optionlocale.appendChild(o);
        if (this.owner.getOption("locale") == ls[i]) {
            this.dom.optionlocale.selectedIndex = i;
        }
    }

    const styles = CONFIG.STYLES;
    SQL.dom.clear(this.dom.optionstyle);
    for (let i = 0; i < styles.length; i++) {
        const o = SQL.dom.create("option");
        o.value = styles[i];
        o.innerHTML = styles[i];
        this.dom.optionstyle.appendChild(o);
        if (this.owner.getOption("style") == styles[i]) {
            this.dom.optionstyle.selectedIndex = i;
        }
    }

    SQL.events.add(this.dom.btn, "click", this.click.bind(this));

    this.dom.container.parentNode.removeChild(this.dom.container);
};

SQL.Options.prototype.save = function () {
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const namespace = this.dom.optionefnamespace.value.trim();
    const context = this.dom.optionefcontext.value.trim();
    const namespaceParts = namespace.split(".");
    const validNamespace = !namespace || namespaceParts.every(
        (part) => identifier.test(part) && !CONFIG.CSHARP_KEYWORDS.includes(part)
    );
    const validContext = !context || (
        identifier.test(context) && !CONFIG.CSHARP_KEYWORDS.includes(context)
    );

    this.dom.optionefnamespace.setCustomValidity("");
    this.dom.optionefcontext.setCustomValidity("");
    if (!validNamespace) {
        this.dom.optionefnamespace.setCustomValidity(
            "Enter dot-separated C# identifiers for the EF namespace."
        );
        this.dom.optionefnamespace.reportValidity();
        this.dom.optionefnamespace.focus();
        return false;
    }
    if (!validContext) {
        this.dom.optionefcontext.setCustomValidity(
            "Enter a non-keyword C# identifier for the EF context name."
        );
        this.dom.optionefcontext.reportValidity();
        this.dom.optionefcontext.focus();
        return false;
    }

    this.owner.setOption("locale", this.dom.optionlocale.value);
    this.owner.setOption(
        "efnamespace",
        namespace || CONFIG.EF_DEFAULT_NAMESPACE
    );
    this.owner.setOption(
        "efcontext",
        context || CONFIG.EF_DEFAULT_CONTEXT
    );
    this.owner.setOption("snap", this.dom.optionsnap.value);
    this.owner.setOption("pattern", this.dom.optionpattern.value);
    this.owner.setOption("style", this.dom.optionstyle.value);
    this.owner.setOption("hide", this.dom.optionhide.checked ? "1" : "");
    this.owner.setOption("vector", this.dom.optionvector.checked ? "1" : "");
    this.owner.setOption(
        "showsize",
        this.dom.optionshowsize.checked ? "1" : ""
    );
    this.owner.setOption(
        "showtype",
        this.dom.optionshowtype.checked ? "1" : ""
    );
};

SQL.Options.prototype.click = function () {
    this.owner.window.open(_("options"), this.dom.container, this.save);
    this.dom.optionsnap.value = this.owner.getOption("snap");
    this.dom.optionefnamespace.value = this.owner.getOption("efnamespace");
    this.dom.optionefcontext.value = this.owner.getOption("efcontext");
    this.dom.optionpattern.value = this.owner.getOption("pattern");
    this.dom.optionhide.checked = this.owner.getOption("hide");
    this.dom.optionvector.checked = this.owner.getOption("vector");
    this.dom.optionshowsize.checked = this.owner.getOption("showsize");
    this.dom.optionshowtype.checked = this.owner.getOption("showtype");
};
