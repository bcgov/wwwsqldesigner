/* ------------------ minimize/restore bar ----------- */

SQL.Toggle = function (elm) {
    this._state = null;
    this._elm = elm;
    SQL.events.add(elm, "click", this._click.bind(this));

    let defaultState = true;
    if (document.location.href.match(/toolbar=hidden/)) {
        defaultState = false;
    }
    this._switch(defaultState);
};

SQL.Toggle.prototype._click = function (e) {
    this._switch(!this._state);
};

SQL.Toggle.prototype._switch = function (state) {
    this._state = state;
    if (this._state) {
        SQL.dom.get("bar").style.maxHeight = "";
        SQL.dom.get("bar").style.overflow = "";
        if (SQL.Designer.mapTools) {
            SQL.Designer.mapTools.close();
        }
    } else {
        SQL.dom.get("bar").style.overflow = "hidden";
        SQL.dom.get("bar").style.maxHeight = this._elm.offsetHeight + "px";
    }
    this._elm.className = this._state ? "on" : "off";
};
