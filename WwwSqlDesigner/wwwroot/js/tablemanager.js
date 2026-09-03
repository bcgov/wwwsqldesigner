/* --------------------- table manager ------------ */

SQL.TableManager = function (owner) {
    this.owner = owner;
    this.dom = {
        container: SQL.dom.get("table"),
        name: SQL.dom.get("tablename"),
        schema: SQL.dom.get("tableschema"),
        comment: SQL.dom.get("tablecomment"),
        recordsSchedule: SQL.dom.get("tablerecordsschedule"),
    };
    this.selection = [];
    this.adding = false;

    let ids = [
        "addtable",
        "removetable",
        "aligntables",
        "cleartables",
        "addrow",
        "edittable",
        "tablekeys",
    ];
    for (let id of ids) {
        const elm = SQL.dom.get(id);
        this.dom[id] = elm;
        elm.value = _(id);
    }

    ids = ["tablenamelabel", "tableschemalabel", "tablecommentlabel", "tablerecordsschedulelabel"];
    for (let id of ids) {
        const elm = SQL.dom.get(id);
        elm.innerHTML = _(id);
    }

    this.select(false);

    this.save = this.save.bind(this);

    SQL.events.add("area", "click", this.click.bind(this));
    SQL.events.add(this.dom.addtable, "click", this.preAdd.bind(this));
    SQL.events.add(this.dom.removetable, "click", this.remove.bind(this));
    SQL.events.add(this.dom.cleartables, "click", this.clear.bind(this));
    SQL.events.add(this.dom.addrow, "click", this.addRow.bind(this));
    SQL.events.add(
        this.dom.aligntables,
        "click",
        this.owner.alignTables.bind(this.owner)
    );
    SQL.events.add(this.dom.edittable, "click", this.edit.bind(this));
    SQL.events.add(this.dom.tablekeys, "click", this.keys.bind(this));
    SQL.events.add(document, "keydown", this.press.bind(this));
    SQL.events.add(this.dom.schema, "input", () => {
        this.dom.schema.setCustomValidity("");
        this.dom.name.setCustomValidity("");
    });
    SQL.events.add(this.dom.name, "input", () => {
        this.dom.name.setCustomValidity("");
        this.dom.schema.setCustomValidity("");
    });

    this.dom.container.parentNode.removeChild(this.dom.container);
};

SQL.TableManager.prototype.addRow = function (e) {
    if (this.owner.rowManager.select(false) === false) {
        return;
    }
    const newrow = this.selection[0].addRow(_("newrow"));
    this.owner.rowManager.select(newrow);
    newrow.expand();
};

SQL.TableManager.prototype.select = function (table, multi) {
    /* activate table */
    if (table) {
        if (multi) {
            const i = this.selection.indexOf(table);
            if (i < 0) {
                this.selection.push(table);
            } else {
                this.selection.splice(i, 1);
            }
        } else {
            if (this.selection[0] === table) {
                return;
            }
            this.selection = [table];
        }
    } else {
        this.selection = [];
    }
    this.processSelection();
};

SQL.TableManager.prototype.processSelection = function () {
    const tables = this.owner.tables;
    for (let table of tables) {
        table.deselect();
    }
    if (this.selection.length == 1) {
        this.dom.addrow.disabled = false;
        this.dom.edittable.disabled = false;
        this.dom.tablekeys.disabled = false;
        this.dom.removetable.value = _("removetable");
    } else {
        this.dom.addrow.disabled = true;
        this.dom.edittable.disabled = true;
        this.dom.tablekeys.disabled = true;
    }
    if (this.selection.length) {
        this.dom.removetable.disabled = false;
        if (this.selection.length > 1) {
            this.dom.removetable.value = _("removetables");
        }
    } else {
        this.dom.removetable.disabled = true;
        this.dom.removetable.value = _("removetable");
    }
    for (let table of this.selection) {
        table.owner.raise(table);
        table.select();
    }
};

SQL.TableManager.prototype.selectRect = function (x, y, width, height) {
    /* select all tables intersecting a rectangle */
    this.selection = [];
    const tables = this.owner.tables;
    const x1 = x + width;
    const y1 = y + height;
    for (let table of tables) {
        const tx = table.x;
        const tx1 = table.x + table.width;
        const ty = table.y;
        const ty1 = table.y + table.height;
        if (
            ((tx >= x && tx < x1) ||
                (tx1 >= x && tx1 < x1) ||
                (tx < x && tx1 > x1)) &&
            ((ty >= y && ty < y1) ||
                (ty1 >= y && ty1 < y1) ||
                (ty < y && ty1 > y1))
        ) {
            this.selection.push(table);
        }
    }
    this.processSelection();
};

SQL.TableManager.prototype.click = function (e) {
    /* finish adding new table */
    let newtable = false;
    if (this.adding) {
        if (this.owner.rowManager.select(false) === false) {
            return;
        }
        this.adding = false;
        SQL.dom.removeClass("area", "adding");
        this.dom.addtable.value = this.oldvalue;
        const scroll = SQL.dom.scroll();
        const x = e.clientX + scroll[0];
        const y = e.clientY + scroll[1];
        newtable = this.owner.addTable(_("newtable"), x, y);
        const r = newtable.addRow("id", { ai: true });
        const k = newtable.addKey("PRIMARY", "");
        k.addRow(r);
    }
    this.select(newtable);
    this.owner.rowManager.select(false);
    if (this.selection.length == 1) {
        this.edit(e, newtable);
    }
};

SQL.TableManager.prototype.preAdd = function (e) {
    /* click add new table */
    if (this.adding) {
        this.adding = false;
        SQL.dom.removeClass("area", "adding");
        this.dom.addtable.value = this.oldvalue;
    } else {
        this.adding = true;
        SQL.dom.addClass("area", "adding");
        this.oldvalue = this.dom.addtable.value;
        this.dom.addtable.value = "[" + _("addpending") + "]";
    }
};

SQL.TableManager.prototype.clear = function (e) {
    /* remove all tables */
    if (!this.owner.tables.length) {
        return;
    }
    const result = confirm(_("confirmall") + " ?");
    if (!result) {
        return;
    }
    if (this.owner.rowManager.select(false) === false) {
        return;
    }
    this.select(false);
    this.owner.clearTables();
};

SQL.TableManager.prototype.remove = function (e) {
    const titles = this.selection.slice(0);
    for (let i = 0; i < titles.length; i++) {
        titles[i] = "'" + titles[i].getTitle() + "'";
    }
    const result = confirm(_("confirmtable") + " " + titles.join(", ") + "?");
    if (!result) {
        return;
    }
    if (this.owner.rowManager.select(false) === false) {
        return;
    }
    const sel = this.selection.slice(0);
    this.select(false);
    for (let table of sel) {
        this.owner.removeTable(table);
    }
};

SQL.TableManager.prototype.edit = function (e, transientTable) {
    this.transientTable = transientTable || null;
    this.owner.window.open(_("edittable"), this.dom.container, this.save, () => {
        if (transientTable && this.owner.tables.indexOf(transientTable) !== -1) {
            this.owner.rowManager.discardSelection(transientTable);
            if (this.selection.indexOf(transientTable) !== -1) {
                this.select(false);
            }
            this.owner.removeTable(transientTable);
        }
        this.transientTable = null;
        this.originalScalarValues = null;
    });

    const title = this.selection[0].getTitle();
    this.dom.name.value = title;
    this.dom.schema.value = this.selection[0].getSchema();
    this.dom.name.setCustomValidity("");
    this.dom.schema.setCustomValidity("");
    try {
        /* throws in ie6 */
        this.originalScalarValues = {
            comment: this.selection[0].getComment(),
            recordsSchedule: this.selection[0].getRecordsSchedule()
        };
        this.dom.comment.value = this.originalScalarValues.comment;
        this.dom.recordsSchedule.value = this.originalScalarValues.recordsSchedule;
    } catch (e) { }

    /* pre-select table name */
    this.dom.name.focus();
    this.dom.name.setSelectionRange(0, title.length);
};

SQL.TableManager.prototype.keys = function (e) {
    /* open keys dialog */
    this.owner.keyManager.open(this.selection[0]);
};

SQL.TableManager.prototype.save = function () {
    const selected = this.selection[0];
    if (!this.dom.name.value.trim()) {
        this.dom.name.setCustomValidity("Table name cannot be empty.");
        this.dom.name.reportValidity();
        this.dom.name.focus();
        return false;
    }
    this.dom.name.setCustomValidity("");
    const schema = SQL.Designer.effectiveSchema(this.dom.schema.value);
    const identity = SQL.Designer.tableIdentity(schema, this.dom.name.value);
    const duplicate = this.owner.tables.some((table) => table !== selected &&
        SQL.Designer.tableIdentity(table.getSchema(), table.getTitle()) === identity);
    if (duplicate) {
        this.dom.schema.setCustomValidity("A table with this schema and name already exists.");
        this.dom.schema.reportValidity();
        return false;
    }
    this.dom.schema.setCustomValidity("");
    selected.setSchema(schema);
    selected.setTitle(this.dom.name.value);
    const original = this.originalScalarValues || { comment: "", recordsSchedule: "" };
    const normalizedComment = original.comment.replace(/\r\n?/g, "\n");
    const normalizedRecordsSchedule = original.recordsSchedule.replace(/\r\n?/g, "\n");
    selected.setComment(this.dom.comment.value === normalizedComment ? original.comment : this.dom.comment.value);
    selected.setRecordsSchedule(this.dom.recordsSchedule.value === normalizedRecordsSchedule ?
        original.recordsSchedule : this.dom.recordsSchedule.value);
    this.transientTable = null;
    this.originalScalarValues = null;
};

SQL.TableManager.prototype.press = function (e) {
    const target = SQL.events.target(e).nodeName.toLowerCase();
    if (target == "textarea" || target == "input") {
        return;
    } /* not when in form field */

    if (this.owner.rowManager.selected) {
        return;
    } /* do not process keypresses if a row is selected */

    if (!this.selection.length) {
        return;
    } /* nothing if selection is active */

    if (e.keyCode == 46) {
        this.remove();
        SQL.events.prevent(e);
    }
};
