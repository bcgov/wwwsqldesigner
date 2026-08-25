SQL.Legend = function (owner) {
    this.owner = owner;
    this.data = {
        name: "",
        title: "",
        author: "",
        application: "",
        created: "",
        modified: "",
    };
    this.savedXml = null;
    this.dom = { inputs: {}, timestamps: {} };

    const container = document.createElement("section");
    container.className = "diagram-legend";
    container.setAttribute("aria-label", _("diagramsummary"));
    this.dom.container = container;

    this.addInput("name", "legendname");
    this.addInput("title", "legendtitle");
    this.addInput("application", "legendapplication");
    this.addInput("author", "legendauthor");
    this.addTimestamp("created", "legendcreated");
    this.addTimestamp("modified", "legendmodified");
    SQL.dom.get("maptoolcontent").appendChild(container);
    this.redraw();
};

SQL.Legend.prototype.addInput = function (name, label) {
    const row = document.createElement("label");
    row.className = "diagram-legend-row";
    const caption = document.createElement("span");
    caption.textContent = _(label);
    const input = document.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", _(label));
    input.addEventListener("input", () => {
        this.data[name] = input.value;
    });
    row.appendChild(caption);
    row.appendChild(input);
    this.dom.container.appendChild(row);
    this.dom.inputs[name] = input;
};

SQL.Legend.prototype.addTimestamp = function (name, label) {
    const row = document.createElement("div");
    row.className = "diagram-legend-row diagram-legend-timestamp";
    const caption = document.createElement("span");
    caption.textContent = _(label);
    const value = document.createElement("span");
    row.appendChild(caption);
    row.appendChild(value);
    this.dom.container.appendChild(row);
    this.dom.timestamps[name] = value;
};

SQL.Legend.prototype.redraw = function () {
    for (let name in this.dom.inputs) {
        this.dom.inputs[name].value = this.data[name];
    }
    for (let name in this.dom.timestamps) {
        const value = this.dom.timestamps[name];
        value.textContent = this.formatDate(this.data[name]);
        value.className = this.data[name] ? "" : "empty";
    }
};

SQL.Legend.prototype.formatDate = function (value) {
    if (!value) {
        return _("legendnotsaved");
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? _("legendnotsaved") : date.toLocaleString();
};

SQL.Legend.prototype.toXML = function () {
    const attrs = [];
    for (let name in this.data) {
        attrs.push(name + '="' + SQL.escape(this.data[name]).replace(/"/g, "&quot;") + '"');
    }
    return "<legend " + attrs.join(" ") + " />\n";
};

SQL.Legend.prototype.fromXML = function (node) {
    for (let name in this.data) {
        this.data[name] = node ? (node.getAttribute(name) || "") : "";
    }
    this.redraw();
};

SQL.Legend.prototype.prepareForSave = function () {
    const currentXml = this.owner.toXML();
    if (this.data.created && this.savedXml === currentXml) {
        return;
    }
    const now = new Date().toISOString();
    if (!this.data.created) {
        this.data.created = now;
    }
    this.data.modified = now;
    this.redraw();
};

SQL.Legend.prototype.rememberSaved = function (xml) {
    this.savedXml = xml || this.owner.toXML();
};
