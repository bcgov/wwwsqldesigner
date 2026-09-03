/* --------------------- row manager ------------ */
SQL.RowManager = function (owner) {
    this.owner = owner;
    this.dom = {};
    this.selected = null;
    this.creating = false;
    this.connecting = false;

    const ids = [
        "editrow",
        "removerow",
        "uprow",
        "downrow",
        "foreigncreate",
        "foreignconnect",
        "foreigndisconnect",
    ];
    for (let id of ids) {
        const elm = SQL.dom.get(id);
        this.dom[id] = elm;
        elm.value = _(id);
    }

    this.select(false);

    SQL.events.add(this.dom.editrow, "click", this.edit.bind(this));
    SQL.events.add(this.dom.uprow, "click", this.up.bind(this));
    SQL.events.add(this.dom.downrow, "click", this.down.bind(this));
    SQL.events.add(this.dom.removerow, "click", this.remove.bind(this));
    SQL.events.add(
        this.dom.foreigncreate,
        "click",
        this.foreigncreate.bind(this)
    );
    SQL.events.add(
        this.dom.foreignconnect,
        "click",
        this.foreignconnect.bind(this)
    );
    SQL.events.add(
        this.dom.foreigndisconnect,
        "click",
        this.foreigndisconnect.bind(this)
    );
    SQL.events.add(document, "keydown", this.press.bind(this));

    SQL.subscribe("tableclick", this.tableClick.bind(this));
    SQL.subscribe("rowclick", this.rowClick.bind(this));
};

SQL.RowManager.prototype.select = function (row) {
    /* activate a row */
    if (this.selected === row) {
        return;
    }
    if (this.selected) {
        if (this.selected.deselect() === false) {
            return false;
        }
    }

    this.selected = row;
    if (this.selected) {
        this.selected.select();
    }
    this.redraw();
    return true;
};

SQL.RowManager.prototype.discardSelection = function (owner) {
    const row = this.selected;
    if (!row || (owner && row !== owner && row.owner !== owner)) {
        return;
    }
    if (row.expanded) {
        row.expanded = false;
        row.dom.container.classList.remove("expanded");
        SQL.dom.clear(row.dom.container);
        row.dom.container.appendChild(row.dom.content);
    }
    row.selected = false;
    for (let relation of row.relations) {
        relation.dehighlight();
    }
    row.redraw();
    this.selected = null;
    this.redraw();
};

SQL.RowManager.prototype.tableClick = function (e) {
    /* create relation after clicking target table */
    if (!this.creating && !e.data.creating) {
        return;
    }

    const r1 = e.data.sourceRow;
    const t2 = e.target;

    let p = this.owner.getOption("pattern");
    p = p.replace(/%T/g, r1.owner.getTitle());
    p = p.replace(/%t/g, t2.getTitle());
    p = p.replace(/%R/g, r1.getTitle());

    if (t2.rows.some((row) => row.getTitle() === p)) {
        alert(_("relationrowexists").replace("%s", p));
        this.beginCreate(r1);
        return;
    }
    const r2 = t2.addRow(p, r1.data);
    r2.update({ type: SQL.Designer.getFKTypeFor(r1.data.type) });
    r2.update({ ai: false });
    this.owner.addRelation(r1, r2);
};

SQL.RowManager.prototype.rowClick = function (e) {
    /* draw relation after clicking target row */
    if (!this.connecting && !e.data.connecting) {
        return;
    }

    const r1 = e.data.sourceRow;
    const r2 = e.target;

    if (r1 == r2) {
        return;
    }

    this.owner.addRelation(r1, r2);
};

SQL.RowManager.prototype.foreigncreate = function (e) {
    /* start creating fk */
    this.endConnect();
    if (this.creating) {
        this.endCreate();
    } else {
        this.beginCreate();
    }
};

SQL.RowManager.prototype.beginCreate = function (sourceRow) {
    if (sourceRow) {
        this.select(sourceRow);
        this.owner.tableManager.select(sourceRow.owner);
    }
    this.creating = true;
    this.dom.foreigncreate.value = "[" + _("foreignpending") + "]";
};

SQL.RowManager.prototype.foreignconnect = function (e) {
    /* start drawing fk */
    this.endCreate();
    if (this.connecting) {
        this.endConnect();
    } else {
        this.connecting = true;
        this.dom.foreignconnect.value = "[" + _("foreignconnectpending") + "]";
    }
};

SQL.RowManager.prototype.foreigndisconnect = function (e) {
    /* remove connector */
    const rels = this.selected.relations;
    for (let i = rels.length - 1; i >= 0; i--) {
        const r = rels[i];
        if (r.row2 == this.selected) {
            this.owner.removeRelation(r);
        }
    }
    this.redraw();
};

SQL.RowManager.prototype.endCreate = function () {
    this.creating = false;
    this.dom.foreigncreate.value = _("foreigncreate");
};

SQL.RowManager.prototype.endConnect = function () {
    this.connecting = false;
    this.dom.foreignconnect.value = _("foreignconnect");
};

SQL.RowManager.prototype.up = function (e) {
    this.selected.up();
    this.redraw();
};

SQL.RowManager.prototype.down = function (e) {
    this.selected.down();
    this.redraw();
};

SQL.RowManager.prototype.remove = function (e) {
    const result = confirm(
        _("confirmrow") + " '" + this.selected.getTitle() + "' ?"
    );
    if (!result) {
        return;
    }
    const row = this.selected;
    const t = row.owner;
    if (this.select(false) === false) {
        return;
    }
    t.removeRow(row);

    let next = false;
    if (t.rows) {
        next = t.rows[t.rows.length - 1];
    }
    this.select(next);
};

SQL.RowManager.prototype.redraw = function () {
    this.endCreate();
    this.endConnect();
    if (this.selected) {
        const table = this.selected.owner;
        const rows = table.rows;
        this.dom.uprow.disabled = rows[0] == this.selected;
        this.dom.downrow.disabled = rows[rows.length - 1] == this.selected;
        this.dom.removerow.disabled = false;
        this.dom.editrow.disabled = false;
        this.dom.foreigncreate.disabled = !this.selected.isUnique();
        this.dom.foreignconnect.disabled = !this.selected.isUnique();

        this.dom.foreigndisconnect.disabled = true;
        const rels = this.selected.relations;
        for (let rel of rels) {
            if (rel.row2 == this.selected) {
                this.dom.foreigndisconnect.disabled = false;
            }
        }
    } else {
        this.dom.uprow.disabled = true;
        this.dom.downrow.disabled = true;
        this.dom.removerow.disabled = true;
        this.dom.editrow.disabled = true;
        this.dom.foreigncreate.disabled = true;
        this.dom.foreignconnect.disabled = true;
        this.dom.foreigndisconnect.disabled = true;
    }
};

SQL.RowManager.prototype.press = function (e) {
    if (!this.selected) {
        return;
    }

    const target = SQL.events.target(e).nodeName.toLowerCase();
    if (target == "textarea" || target == "input") {
        return;
    } /* not when in form field */

    switch (e.keyCode) {
        case 38:
            this.up();
            SQL.events.prevent(e);
            break;
        case 40:
            this.down();
            SQL.events.prevent(e);
            break;
        case 46:
            this.remove();
            SQL.events.prevent(e);
            break;
        case 13:
        case 27:
            this.selected.collapse();
            break;
    }
};

SQL.RowManager.prototype.edit = function (e) {
    this.selected.expand();
};
