/* --------------------- table row ( = db column) ------------ */
SQL.Row = function (owner, title, data) {
    this.owner = owner;
    this.relations = [];
    this.keys = [];
    this.selected = false;
    this.expanded = false;

    SQL.Visual.apply(this);

    this.data.type = 0;
    this.data.size = "";
    this.data.def = null;
    this.data.nll = true;
    this.data.ai = false;
    this.data.comment = "";
    this.data.classification = "";

    if (data) {
        this.update(data);
    }
    this.setTitle(title);
};
SQL.Row.prototype = Object.create(SQL.Visual.prototype);

SQL.Row.prototype._build = function () {
    this.dom.container = SQL.dom.create("tbody");

    this.dom.content = SQL.dom.create("tr");
    this.dom.selected = SQL.dom.create("div", {
        className: "selected",
        innerHTML: "&raquo;&nbsp;",
    });
    this.dom.title = SQL.dom.create("div", { className: "title" });
    const td1 = SQL.dom.create("td");
    const td2 = SQL.dom.create("td", { className: "typehint" });
    this.dom.typehint = td2;

    SQL.dom.append(
        [this.dom.container, this.dom.content],
        [this.dom.content, td1, td2],
        [td1, this.dom.selected, this.dom.title]
    );

    this.enter = this.enter.bind(this);
    this.changeComment = this.changeComment.bind(this);

    SQL.events.add(this.dom.container, "click", this.click.bind(this));
    SQL.events.add(this.dom.container, "dblclick", this.dblclick.bind(this));
};

SQL.Row.prototype.select = function () {
    if (this.selected) {
        return;
    }
    this.selected = true;
    for (let relation of this.relations) {
        relation.highlight();
    }
    this.redraw();
};

SQL.Row.prototype.deselect = function () {
    if (!this.selected) {
        return true;
    }
    if (this.collapse() === false) {
        return false;
    }
    this.selected = false;
    for (let relation of this.relations) {
        relation.dehighlight();
    }
    this.redraw();
    return true;
};

SQL.Row.prototype.setTitle = function (t) {
    const old = this.getTitle();
    for (let relation of this.relations) {
        if (relation.row1 != this) {
            continue;
        }
        const tt = relation.row2.getTitle().replace(new RegExp(old, "g"), t);
        if (tt != relation.row2.getTitle()) {
            relation.row2.setTitle(tt);
        }
    }

    SQL.Visual.prototype.setTitle.apply(this, [t]);
};

SQL.Row.prototype.click = function (e) {
    /* clicked on row */
    SQL.events.stop(e);
    const rowManager = this.owner.owner.rowManager;
    const sourceRow = rowManager.selected;
    const connecting = rowManager.connecting;
    if (rowManager.select(this) === false) {
        return;
    }
    SQL.publish("rowclick", this, { sourceRow: sourceRow, connecting: connecting });
    this.owner.owner.tableManager.select(this.owner);
};

SQL.Row.prototype.dblclick = function (e) {
    /* dblclicked on row */
    SQL.events.prevent(e);
    SQL.events.stop(e);
    if (this.owner.owner.rowManager.selected === this) {
        this.expand();
    }
};

SQL.Row.prototype.update = function (data) {
    /* update subset of row data */
    const des = SQL.Designer;
    if (data.nll && data.def && data.def.match(/^null$/i)) {
        data.def = null;
    }

    for (let p in data) {
        this.data[p] = data[p];
    }
    if (!this.data.nll && this.data.def === null) {
        this.data.def = "";
    }

    for (let relation of this.relations) {
        if (relation.row1 == this) {
            relation.row2.update({
                type: des.getFKTypeFor(this.data.type),
                size: this.data.size,
            });
        }
    }
    this.redraw();
};

SQL.Row.prototype.up = function () {
    /* shift up */
    const r = this.owner.rows;
    const idx = r.indexOf(this);
    if (!idx) {
        return;
    }
    r[idx - 1].dom.container.parentNode.insertBefore(
        this.dom.container,
        r[idx - 1].dom.container
    );
    r.splice(idx, 1);
    r.splice(idx - 1, 0, this);
    this.redraw();
};

SQL.Row.prototype.down = function () {
    /* shift down */
    const r = this.owner.rows;
    const idx = r.indexOf(this);
    if (idx + 1 == this.owner.rows.length) {
        return;
    }
    r[idx].dom.container.parentNode.insertBefore(
        this.dom.container,
        r[idx + 1].dom.container.nextSibling
    );
    r.splice(idx, 1);
    r.splice(idx + 1, 0, this);
    this.redraw();
};

SQL.Row.prototype.buildEdit = function () {
    SQL.dom.clear(this.dom.container);

    const elms = [];
    this.dom.name = SQL.dom.create("input");
    this.dom.name.type = "text";
    elms.push(["name", this.dom.name]);
    SQL.events.add(this.dom.name, "keypress", this.enter);
    SQL.events.add(this.dom.name, "input", () => this.dom.name.setCustomValidity(""));

    this.dom.type = this.buildTypeSelect(this.data.type);
    elms.push(["type", this.dom.type]);

    this.dom.size = SQL.dom.create("input");
    this.dom.size.type = "text";
    elms.push(["size", this.dom.size]);

    this.dom.def = SQL.dom.create("input");
    this.dom.def.type = "text";
    elms.push(["def", this.dom.def]);

    this.dom.ai = SQL.dom.create("input");
    this.dom.ai.type = "checkbox";
    elms.push(["ai", this.dom.ai]);

    this.dom.nll = SQL.dom.create("input");
    this.dom.nll.type = "checkbox";
    elms.push(["null", this.dom.nll]);

    this.dom.classification = SQL.dom.create("select");
    this.dom.classification.setAttribute("aria-label", _("classification"));
    for (const value of ["", "Public", "Protected A", "Protected B", "Protected C"]) {
        const option = SQL.dom.create("option");
        option.value = value;
        option.textContent = value;
        this.dom.classification.appendChild(option);
    }
    elms.push(["classification", this.dom.classification]);

    this.dom.comment = SQL.dom.create("span", { className: "comment" });
    this.dom.comment.innerHTML = "";
    this.dom.comment.appendChild(document.createTextNode(this.data.comment));

    this.dom.commentbtn = SQL.dom.create("input");
    this.dom.commentbtn.type = "button";
    this.dom.commentbtn.id = "commentbtn";
    this.dom.commentbtn.value = _("comment");

    SQL.events.add(this.dom.commentbtn, "click", this.changeComment);

    let tr;
    let td1;
    let td2
    for (let row of elms) {
        tr = SQL.dom.create("tr");
        td1 = SQL.dom.create("td");
        td2 = SQL.dom.create("td");
        const l = SQL.dom.text(_(row[0]) + ": ");
        SQL.dom.append([tr, td1, td2], [td1, l], [td2, row[1]]);
        this.dom.container.appendChild(tr);
    }

    tr = SQL.dom.create("tr");
    td1 = SQL.dom.create("td");
    td2 = SQL.dom.create("td");
    SQL.dom.append(
        [tr, td1, td2],
        [td1, this.dom.comment],
        [td2, this.dom.commentbtn]
    );
    this.dom.container.appendChild(tr);
};

SQL.Row.prototype.changeComment = function (e) {
    const c = prompt(_("commenttext"), this.data.comment);
    if (c === null) {
        return;
    }
    this.data.comment = c;
    this.dom.comment.innerHTML = "";
    this.dom.comment.appendChild(document.createTextNode(this.data.comment));
};

SQL.Row.prototype.expand = function () {
    if (this.expanded) {
        return;
    }
    this.expanded = true;
    this.buildEdit();
    this.load();
    this.redraw();
    this.dom.container.classList.add("expanded");
    this.dom.name.focus();
    this.dom.name.select();
};

SQL.Row.prototype.collapse = function () {
    if (!this.expanded) {
        return true;
    }
    const title = this.dom.name.value;
    const duplicate = this.owner.rows.some((row) =>
        row !== this && row.getTitle() === title);
    if (!title || duplicate) {
        this.dom.name.setCustomValidity(
            !title ? "Field name cannot be empty." : "A field with this name already exists."
        );
        this.dom.name.reportValidity();
        this.dom.name.focus();
        return false;
    }
    this.dom.name.setCustomValidity("");
    this.expanded = false;
    this.dom.container.classList.remove("expanded");

    const data = {
        type: this.dom.type.selectedIndex,
        def: this.dom.def.value,
        size: this.dom.size.value,
        nll: this.dom.nll.checked,
        ai: this.dom.ai.checked,
        classification: this.dom.classification.value,
    };

    SQL.dom.clear(this.dom.container);
    this.dom.container.appendChild(this.dom.content);

    this.update(data);
    this.setTitle(title);
    return true;
};

SQL.Row.prototype.load = function () {
    /* put data to expanded form */
    this.dom.name.value = this.getTitle();
    let def = this.data.def;
    if (def === null) {
        def = "NULL";
    }

    this.dom.def.value = def;
    this.dom.size.value = this.data.size;
    this.dom.nll.checked = this.data.nll;
    this.dom.ai.checked = this.data.ai;
    this.dom.classification.value = this.data.classification;
};

SQL.Row.prototype.redraw = function () {
    const color = this.getColor();
    this.dom.container.style.backgroundColor = color;
    this.dom.container.style.borderColor = color;
    SQL.dom.removeClass(this.dom.title, "primary");
    SQL.dom.removeClass(this.dom.title, "key");
    if (this.isPrimary()) {
        SQL.dom.addClass(this.dom.title, "primary");
    }
    if (this.isKey()) {
        SQL.dom.addClass(this.dom.title, "key");
    }
    this.dom.selected.style.display = this.selected ? "" : "none";
    this.dom.container.title = this.data.comment;

    const typehint = [];
    if (this.owner.owner.getOption("showtype")) {
        const elm = this.getDataType();
        typehint.push(elm.getAttribute("sql"));
    }

    if (this.owner.owner.getOption("showsize") && this.data.size) {
        typehint.push("(" + this.data.size + ")");
    }

    this.dom.typehint.innerHTML = typehint.join(" ");
    this.owner.redraw();
    this.owner.owner.rowManager.redraw();
};

SQL.Row.prototype.addRelation = function (r) {
    this.relations.push(r);
};

SQL.Row.prototype.removeRelation = function (r) {
    const idx = this.relations.indexOf(r);
    if (idx == -1) {
        return;
    }
    this.relations.splice(idx, 1);
};

SQL.Row.prototype.addKey = function (k) {
    this.keys.push(k);
    this.redraw();
};

SQL.Row.prototype.removeKey = function (k) {
    const idx = this.keys.indexOf(k);
    if (idx == -1) {
        return;
    }
    this.keys.splice(idx, 1);
    this.redraw();
};

SQL.Row.prototype.getDataType = function () {
    const type = this.data.type;
    const elm = DATATYPES.getElementsByTagName("type")[type];
    return elm;
};

SQL.Row.prototype.getColor = function () {
    const elm = this.getDataType();
    const g = this.getDataType().parentNode;
    return elm.getAttribute("color") || g.getAttribute("color") || "#fff";
};

SQL.Row.prototype.buildTypeSelect = function (id) {
    /* build selectbox with avail datatypes */
    const s = SQL.dom.create("select");
    const gs = DATATYPES.getElementsByTagName("group");
    for (let g of gs) {
        const og = SQL.dom.create("optgroup");
        og.style.backgroundColor = g.getAttribute("color") || "#fff";
        og.label = g.getAttribute("label");
        s.appendChild(og);
        const ts = g.getElementsByTagName("type");
        for (let t of ts) {
            const o = SQL.dom.create("option");
            if (t.getAttribute("color")) {
                o.style.backgroundColor = t.getAttribute("color");
            }
            if (t.getAttribute("note")) {
                o.title = t.getAttribute("note");
            }
            o.innerHTML = t.getAttribute("label");
            og.appendChild(o);
        }
    }
    s.selectedIndex = id;
    return s;
};

SQL.Row.prototype.destroy = function () {
    SQL.Visual.prototype.destroy.apply(this);
    while (this.relations.length) {
        this.owner.owner.removeRelation(this.relations[0]);
    }
    while (this.keys.length) {
        this.keys[0].removeRow(this);
    }
};

SQL.Row.prototype.toXML = function () {
    let xml = '';
    const name = this.getTitle().replace(/"/g, "&quot;");
    xml += '<row name="' + name + '" null="' + (this.data.nll ? "1" : "0") + '" autoincrement="' + (this.data.ai ? "1" : "0") + '">\n';
    const elm = this.getDataType();
    const type = elm.getAttribute("sql");
    xml += "<datatype>" + type + (this.data.size ? "(" + this.data.size + ")" : "") + "</datatype>\n";
    if (this.data.def || this.data.def === null) {
        let value = this.data.def === null ? "NULL" : this.data.def;
        const quote = elm.getAttribute("quote");
        if (quote && this.data.def !== null && value !== "CURRENT_TIMESTAMP") { value = quote + value + quote; }
        xml += "<default>" + SQL.escape(value) + "</default>";
    }
    for (let relation of this.relations) {
        if (relation.row2 !== this) { continue; }
        const target = relation.row1.owner;
        xml += '<relation table="' + SQL.escape(target.getTitle()).replace(/"/g, "&quot;") +
            '" schema="' + SQL.escape(target.getSchema()).replace(/"/g, "&quot;") +
            '" row="' + SQL.escape(relation.row1.getTitle()).replace(/"/g, "&quot;") +
            (relation.name ? '" name="' + SQL.escape(relation.name).replace(/"/g, "&quot;") : "") + '" />\n';
    }
    if (this.data.comment) { xml += "<comment>" + SQL.escape(this.data.comment) + "</comment>\n"; }
    if (this.data.classification) { xml += "<classification>" + SQL.escape(this.data.classification) + "</classification>\n"; }
    return xml + "</row>\n";
};

SQL.Row.prototype.fromXML = function (node) {
    const obj = { type: 0, size: "", nll: node.getAttribute("null") === "1", ai: node.getAttribute("autoincrement") === "1" };
    const comment = SQL.Designer.directChild(node, "comment");
    if (comment && comment.firstChild) { obj.comment = comment.firstChild.nodeValue; }
    const classification = SQL.Designer.directChild(node, "classification");
    if (classification) { obj.classification = classification.textContent; }
    const datatype = SQL.Designer.directChild(node, "datatype");
    if (datatype) {
        const portable = SQL.PortableTypes.canonical(datatype.textContent);
        if (portable) {
            obj.size = portable.facets;
            const types = window.DATATYPES.getElementsByTagName("type");
            for (let i = 0; i < types.length; i++) { if (types[i].getAttribute("sql") === portable.kind) { obj.type = i; break; } }
        }
    }
    const defaultValue = SQL.Designer.directChild(node, "default");
    if (defaultValue && defaultValue.firstChild) {
        obj.def = defaultValue.firstChild.nodeValue;
        const quote = window.DATATYPES.getElementsByTagName("type")[obj.type].getAttribute("quote");
        if (quote && obj.def.length >= quote.length * 2 && obj.def.indexOf(quote) === 0 && obj.def.lastIndexOf(quote) === obj.def.length - quote.length) { obj.def = obj.def.slice(quote.length, -quote.length); }
    }
    this.update(obj);
    this.setTitle(node.getAttribute("name"));
};
SQL.Row.prototype.isPrimary = function () {
    for (let key of this.keys) {
        if (key.getType() == "PRIMARY") {
            return true;
        }
    }
    return false;
};

SQL.Row.prototype.isUnique = function () {
    for (let key of this.keys) {
        if (key.getType() == "PRIMARY" || key.getType() == "UNIQUE") {
            return true;
        }
    }
    return false;
};

SQL.Row.prototype.isKey = function () {
    return this.keys.length > 0;
};

SQL.Row.prototype.enter = function (e) {
    if (e.keyCode == 13) {
        this.collapse();
    }
};
