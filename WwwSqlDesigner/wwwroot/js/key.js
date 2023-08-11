/* --------------------- db index ------------ */
SQL.Key = function (owner, type, name) {
    this.owner = owner;
    this.rows = [];
    this.type = type || "INDEX";
    this.name = name || "";
    SQL.Visual.apply(this);
};
SQL.Key.prototype = Object.create(SQL.Visual.prototype);

SQL.Key.prototype.setName = function (n) {
    this.name = n;
};

SQL.Key.prototype.getName = function () {
    return this.name;
};

SQL.Key.prototype.setType = function (t) {
    if (!t) {
        return;
    }
    this.type = t;
    for (let row of this.rows) {
        row.redraw();
    }
};

SQL.Key.prototype.getType = function () {
    return this.type;
};

SQL.Key.prototype.addRow = function (r) {
    if (r.owner != this.owner) {
        return;
    }
    this.rows.push(r);
    r.addKey(this);
};

SQL.Key.prototype.removeRow = function (r) {
    const idx = this.rows.indexOf(r);
    if (idx == -1) {
        return;
    }
    r.removeKey(this);
    this.rows.splice(idx, 1);
};

SQL.Key.prototype.destroy = function () {
    for (let row of this.rows) {
        row.removeKey(this);
    }
};

SQL.Key.prototype.getLabel = function () {
    return this.name || this.type;
};

SQL.Key.prototype.toXML = function () {
    let xml = "";
    xml +=
        '<key type="' + this.getType() + '" name="' + this.getName() + '">\n';
    for (let row of this.rows) {        
        xml += "<part>" + row.getTitle() + "</part>\n";
    }
    xml += "</key>\n";
    return xml;
};

SQL.Key.prototype.fromXML = function (node) {
    this.setType(node.getAttribute("type"));
    this.setName(node.getAttribute("name"));
    const parts = node.getElementsByTagName("part");
    for (let part of parts) {
        const name = part.firstChild.nodeValue;
        const row = this.owner.findNamedRow(name);
        this.addRow(row);
    }
};
