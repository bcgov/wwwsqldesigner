/* --------------------- db table ------------ */
SQL.Table = function (owner, name, x, y, z) {
    this.owner = owner;
    this.rows = [];
    this.keys = [];
    this.zIndex = 0;
    this._ec = [];

    this.flag = false;
    this.selected = false;
    SQL.Visual.apply(this);
    this.data.comment = "";
    this.schema = SQL.Designer.effectiveSchema();

    this.setTitle(name);
    this.x = x || 0;
    this.y = y || 0;
    this.setZ(z);
    this.snap();
};
SQL.Table.prototype = Object.create(SQL.Visual.prototype);

SQL.Table.prototype._build = function () {
    this.dom.container = SQL.dom.create("div", { className: "table" });
    this.dom.content = SQL.dom.create("table");
    const thead = SQL.dom.create("thead");
    const tr = SQL.dom.create("tr");
    this.dom.title = SQL.dom.create("td", { className: "title", colSpan: 2 });

    SQL.dom.append(
        [this.dom.container, this.dom.content],
        [this.dom.content, thead],
        [thead, tr],
        [tr, this.dom.title]
    );

    this.dom.mini = SQL.dom.create("div", { className: "mini" });
    this.owner.map.dom.container.appendChild(this.dom.mini);

    this._ec.push(
        SQL.events.add(this.dom.container, "click", this.click.bind(this))
    );
    this._ec.push(
        SQL.events.add(this.dom.container, "dblclick", this.dblclick.bind(this))
    );
    this._ec.push(
        SQL.events.add(this.dom.container, "mousedown", this.down.bind(this))
    );
    this._ec.push(
        SQL.events.add(this.dom.container, "touchstart", this.down.bind(this))
    );
    this._ec.push(
        SQL.events.add(this.dom.container, "touchmove", SQL.events.prevent)
    );
};

SQL.Table.prototype.setTitle = function (t) {
    const old = this.getTitle();
    for (let row of this.rows) {
        for (let relation of row.relations) {
            if (relation.row1 != row) {
                continue;
            }
            const tt = row.getTitle().replace(new RegExp(old, "g"), t);
            if (tt != row.getTitle()) {
                row.setTitle(tt);
            }
        }
    }
    SQL.Visual.prototype.setTitle.apply(this, [t]);
};

SQL.Table.prototype.getRelations = function () {
    const arr = [];
    for (let row of this.rows) {
        for (let relation of row.relations) {
            if (arr.indexOf(relation) == -1) {
                arr.push(relation);
            }
        }
    }
    return arr;
};

SQL.Table.prototype.showRelations = function () {
    const rs = this.getRelations();
    for (let relation of rs) {
        relation.show();
    }
};

SQL.Table.prototype.hideRelations = function () {
    const rs = this.getRelations();
    for (let relation of rs) {
        relation.hide();
    }
};

SQL.Table.prototype.click = function (e) {
    SQL.events.stop(e);
    const t = SQL.events.target(e);

    if (t != this.dom.title) {
        return;
    } /* click on row */

    const rowManager = this.owner.rowManager;
    const sourceRow = this.clickSourceRow || rowManager.selected;
    const creating = this.clickCreating || rowManager.creating;
    this.clickSourceRow = null;
    this.clickCreating = false;
    if (rowManager.select(false) === false) {
        return;
    }
    this.owner.tableManager.select(this);
    SQL.publish("tableclick", this, { sourceRow: sourceRow, creating: creating });
};

SQL.Table.prototype.dblclick = function (e) {
    const t = SQL.events.target(e);
    const selection = this.owner.tableManager.selection;
    if (t == this.dom.title && selection.length == 1 && selection[0] === this) {
        this.owner.tableManager.edit();
    }
};

SQL.Table.prototype.select = function () {
    if (this.selected) {
        return;
    }
    this.selected = true;
    SQL.dom.addClass(this.dom.container, "selected");
    SQL.dom.addClass(this.dom.mini, "mini_selected");
    this.redraw();
};

SQL.Table.prototype.deselect = function () {
    if (!this.selected) {
        return;
    }
    this.selected = false;
    SQL.dom.removeClass(this.dom.container, "selected");
    SQL.dom.removeClass(this.dom.mini, "mini_selected");
    this.redraw();
};

SQL.Table.prototype.addRow = function (title, data) {
    const r = new SQL.Row(this, title, data);
    this.rows.push(r);
    this.dom.content.appendChild(r.dom.container);
    this.redraw();
    return r;
};

SQL.Table.prototype.removeRow = function (r) {
    const idx = this.rows.indexOf(r);
    if (idx == -1) {
        return;
    }
    r.destroy();
    this.rows.splice(idx, 1);
    this.redraw();
};

SQL.Table.prototype.addKey = function (name) {
    const k = new SQL.Key(this, name);
    this.keys.push(k);
    return k;
};

SQL.Table.prototype.removeKey = function (k) {
    const idx = this.keys.indexOf(k);
    if (idx == -1) {
        return;
    }
    k.destroy();
    this.keys.splice(idx, 1);
};

SQL.Table.prototype.redraw = function () {
    let x = this.x;
    let y = this.y;
    if (this.selected) {
        x--;
        y--;
    }
    this.dom.container.style.left = x + "px";
    this.dom.container.style.top = y + "px";

    const ratioX = this.owner.map.width / this.owner.width;
    const ratioY = this.owner.map.height / this.owner.height;

    const w = this.dom.container.offsetWidth * ratioX;
    const h = this.dom.container.offsetHeight * ratioY;
    x = this.x * ratioX;
    y = this.y * ratioY;

    this.dom.mini.style.width = Math.round(w) + "px";
    this.dom.mini.style.height = Math.round(h) + "px";
    this.dom.mini.style.left = Math.round(x) + "px";
    this.dom.mini.style.top = Math.round(y) + "px";

    this.width = this.dom.container.offsetWidth;
    this.height = this.dom.container.offsetHeight;

    const rs = this.getRelations();
    for (let relation of rs) {
        relation.redraw();
    }
};

SQL.Table.prototype.moveBy = function (dx, dy) {
    this.x += dx;
    this.y += dy;

    this.snap();
    this.redraw();
};

SQL.Table.prototype.moveTo = function (x, y) {
    this.x = x;
    this.y = y;

    this.snap();
    this.redraw();
};

SQL.Table.prototype.snap = function () {
    const snap = parseInt(SQL.Designer.getOption("snap"));
    if (snap) {
        this.x = Math.round(this.x / snap) * snap;
        this.y = Math.round(this.y / snap) * snap;
    }
};

SQL.Table.prototype.down = function (e) {
    /* mousedown - start drag */
    SQL.events.stop(e);
    let t = SQL.events.target(e);
    if (t != this.dom.title) {
        return;
    } /* on a row */

    const rowManager = this.owner.rowManager;
    const sourceRow = rowManager.selected;
    const creating = rowManager.creating;
    if (rowManager.select(false) === false) {
        return;
    }
    this.clickSourceRow = sourceRow;
    this.clickCreating = creating;

    /* touch? */
    let event;
    let moveEvent;
    let upEvent;
    if (e.type == "touchstart") {
        event = e.touches[0];
        moveEvent = "touchmove";
        upEvent = "touchend";
    } else {
        event = e;
        moveEvent = "mousemove";
        upEvent = "mouseup";
    }

    /* a non-shift click within a selection preserves the selection */
    if (e.shiftKey || !this.selected) {
        this.owner.tableManager.select(this, e.shiftKey);
    }

    t = SQL.Table;
    t.active = this.owner.tableManager.selection;
    const n = t.active.length;
    t.x = new Array(n);
    t.y = new Array(n);
    for (let i = 0; i < n; i++) {
        /* position relative to mouse cursor */
        t.x[i] = t.active[i].x - event.clientX;
        t.y[i] = t.active[i].y - event.clientY;
    }

    if (this.owner.getOption("hide")) {
        for (let i = 0; i < n; i++) {
            t.active[i].hideRelations();
        }
    }

    this.documentMove = SQL.events.add(document, moveEvent, this.move.bind(this));
    this.documentUp = SQL.events.add(document, upEvent, this.up.bind(this));
};

SQL.Table.prototype.toXML = function () {
    const t = SQL.escape(this.getTitle()).replace(/"/g, "&quot;");
    const schema = SQL.escape(this.getSchema()).replace(/"/g, "&quot;");
    let xml = "";
    xml += '<table x="' + this.x + '" y="' + this.y + '" name="' + t + '" schema="' + schema + '">\n';
    for (let row of this.rows) {
        xml += row.toXML();
    }
    for (let key of this.keys) {
        xml += key.toXML();
    }
    const c = this.getComment();
    if (c) {
        xml += "<comment>" + SQL.escape(c) + "</comment>\n";
    }
    xml += "</table>\n";
    return xml;
};

SQL.Table.prototype.fromXML = function (node) {
    this.setSchema(node.getAttribute("schema"));
    const name = node.getAttribute("name");
    this.setTitle(name);
    const x = parseInt(node.getAttribute("x")) || 0;
    const y = parseInt(node.getAttribute("y")) || 0;
    this.moveTo(x, y);
    const rows = SQL.Designer.directChildren(node, "row");
    for (let row of rows) {
        const r = this.addRow("");
        r.fromXML(row);
    }
    const keys = SQL.Designer.directChildren(node, "key");
    for (let key of keys) {
        const k = this.addKey();
        k.fromXML(key);
    }
    for (let ch of node.childNodes) {
        if (ch.tagName &&
            ch.tagName.toLowerCase() == "comment" &&
            ch.firstChild
        ) {
            this.setComment(ch.firstChild.nodeValue);
        }
    }
};

SQL.Table.prototype.getSchema = function () {
    return this.schema;
};

SQL.Table.prototype.setSchema = function (schema) {
    this.schema = SQL.Designer.effectiveSchema(schema);
};

SQL.Table.prototype.getZ = function () {
    return this.zIndex;
};

SQL.Table.prototype.setZ = function (z) {
    this.zIndex = z;
    this.dom.container.style.zIndex = z;
};

SQL.Table.prototype.findNamedRow = function (n) {
    /* return row with a given name */
    for (let row of this.rows) {
        if (row.getTitle() == n) {
            return row;
        }
    }
    return false;
};

SQL.Table.prototype.setComment = function (c) {
    this.data.comment = c;
    this.dom.title.title = this.data.comment;
};

SQL.Table.prototype.getComment = function () {
    return this.data.comment;
};

SQL.Table.prototype.move = function (e) {
    /* mousemove */
    const t = SQL.Table;
    SQL.Designer.removeSelection();
    let event;
    if (e.type == "touchmove") {
        if (e.touches.length > 1) {
            return;
        }
        event = e.touches[0];
    } else {
        event = e;
    }

    for (let i = 0; i < t.active.length; i++) {
        let x = t.x[i] + event.clientX;
        let y = t.y[i] + event.clientY;
        x = Math.max(x, 0);
        y = Math.max(y, 0);
        t.active[i].moveTo(x, y);
    }
};

SQL.Table.prototype.up = function (e) {
    const t = SQL.Table;
    const d = SQL.Designer;
    if (d.getOption("hide")) {
        for (let ta of t.active) {
            ta.showRelations();
            ta.redraw();
        }
    }
    t.active = false;
    SQL.events.remove(this.documentMove);
    SQL.events.remove(this.documentUp);
    this.owner.sync();
};

SQL.Table.prototype.destroy = function () {
    SQL.Visual.prototype.destroy.apply(this);
    this.dom.mini.parentNode.removeChild(this.dom.mini);
    while (this.rows.length) {
        this.removeRow(this.rows[0]);
    }
    this._ec.forEach(SQL.events.remove, SQL.events);
};
