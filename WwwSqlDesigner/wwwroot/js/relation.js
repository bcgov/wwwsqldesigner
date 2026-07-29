/* --------------------------- relation (connector) ----------- */

SQL.Relation = function (owner, row1, row2) {
    this.owner = owner;
    this.row1 = row1;
    this.row2 = row2;
    this.color = "#000";
    this.hidden = false;
    this.relationColors = CONFIG.RELATION_COLORS;
    this.highlighted = null;
    this.name = "";
    this.editing = false;
    this.editingWidth = 0;
    this.transitionTimeout = null;
    SQL.Visual.apply(this);

    this.style = SQL.Designer.getOption("style");
    switch (this.style) {
        case "material-inspired":
            this.relationColors = CONFIG.MATERIAL_RELATION_COLORS;
            break;
        case "original":
        default:
            this.relationColors = CONFIG.RELATION_COLORS;
    }

    /* if one of the rows already has relations, inherit color */
    const all = row1.relations.concat(row2.relations);
    if (all.length) {
        /* inherit */
        this.color = all[0].getColor();
    } else if (this.relationColors) {
        /* pick next */
        SQL.Relation._counter++;
        const colorIndex = (SQL.Relation._counter - 1) % this.relationColors.length;
        this.color = this.relationColors[colorIndex];
    }

    this.row1.addRelation(this);
    this.row2.addRelation(this);
    this.dom = [];

    if (this.owner.vector) {
        const path = document.createElementNS(this.owner.svgNS, "path");
        path.setAttribute("stroke", this.color);
        path.setAttribute("stroke-width", CONFIG.RELATION_THICKNESS);
        path.setAttribute("fill", "none");
        this.owner.dom.svg.appendChild(path);
        this.dom.push(path);
        this.dom.handle = document.createElementNS(this.owner.svgNS, "rect");
        this.dom.handle.setAttribute("class", "relation-handle");
        this.dom.handle.setAttribute("rx", "6");
        this.dom.handle.setAttribute("ry", "6");
        this.dom.handle.setAttribute("fill", "#fff");
        this.dom.handle.setAttribute("stroke", this.color);
        this.dom.handle.setAttribute("stroke-width", "2");
        this.dom.handle.style.cursor = "pointer";
        this.owner.dom.svg.appendChild(this.dom.handle);
    } else {
        for (let i = 0; i < 3; i++) {
            const div = OZ.DOM.elm("div", {
                position: "absolute",
                className: "relation",
                backgroundColor: this.color,
            });
            this.dom.push(div);
            if (i & 1) {
                /* middle */
                OZ.Style.set(div, { width: CONFIG.RELATION_THICKNESS + "px" });
            } else {
                /* first & last */
                OZ.Style.set(div, { height: CONFIG.RELATION_THICKNESS + "px" });
            }
            this.owner.dom.container.appendChild(div);
        }
        this.dom.handle = OZ.DOM.elm("div", {
            position: "absolute",
            className: "relation-handle",
        });
        OZ.Style.set(this.dom.handle, {
            border: "2px solid " + this.color,
            borderRadius: "6px",
            backgroundColor: "#fff",
            boxSizing: "border-box",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 8px",
        });
        this.owner.dom.container.appendChild(this.dom.handle);
    }

    this.dom.input = document.createElement("input");
    this.dom.input.setAttribute("type", "text");
    this.dom.input.setAttribute("class", "relation-name-input");
    this.dom.input.setAttribute("aria-label", _("relationname"));
    this.dom.input.setAttribute("autocomplete", "off");
    this.dom.input.readOnly = true;
    this.owner.dom.container.appendChild(this.dom.input);

    this.dom.input.addEventListener("focus", this.editName.bind(this));
    this.dom.input.addEventListener("dblclick", this.selectName.bind(this));
    this.dom.input.addEventListener("blur", this.finishName.bind(this, false));
    this.dom.input.addEventListener("input", this.resizeName.bind(this));
    this.dom.input.addEventListener("keydown", this.keydownName.bind(this));
    this.outsideClick = this.clickAway.bind(this);
    this.redraw();
};
SQL.Relation._counter = 0;
SQL.Relation.prototype = Object.create(SQL.Visual.prototype);

SQL.Relation.prototype.getColor = function () {
    return this.color;
};

SQL.Relation.prototype.highlight = function () {
    if (this.highlighted) {
        return;
    }
    this.highlighted = true;
    this.dom[0].setAttribute("stroke", CONFIG.RELATION_HIGHLIGHTED_COLOR);
    this.dom[0].setAttribute(
        "stroke-width",
        CONFIG.RELATION_HIGHLIGHTED_THICKNESS
    );
    this.redraw();
};

SQL.Relation.prototype.dehighlight = function () {
    if (!this.highlighted) {
        return;
    }
    this.highlighted = false;
    this.dom[0].setAttribute("stroke", this.color);
    this.dom[0].setAttribute("stroke-width", CONFIG.RELATION_THICKNESS);
    this.redraw();
};

SQL.Relation.prototype.show = function () {
    this.hidden = false;
    for (let elm of this.dom) {
        elm.style.visibility = "";
    }
    this.dom.handle.style.visibility = "";
    this.dom.input.style.visibility = "";
};

SQL.Relation.prototype.hide = function () {
    this.hidden = true;
    for (let elm of this.dom) {
        elm.style.visibility = "hidden";
    }
    this.dom.handle.style.visibility = "hidden";
    this.dom.input.style.visibility = "hidden";
};

SQL.Relation.prototype.editName = function (e) {
    if (this.editing) {
        return;
    }
    const handleBounds = this.owner.vector
        ? this.dom.handle.getBBox()
        : { width: this.dom.handle.offsetWidth };
    this.editingWidth = Math.max(24, handleBounds.width);
    this.transitionControl();
    this.editing = true;
    document.addEventListener("pointerdown", this.outsideClick, true);
    this.dom.input.value = this.name;
    this.redraw();
    this.dom.input.select();
};

SQL.Relation.prototype.selectName = function () {
    if (this.editing) {
        this.dom.input.select();
    }
};

SQL.Relation.prototype.keydownName = function (e) {
    if (!this.editing && (e.key === "Enter" || e.key === " ")) {
        this.editName(e);
    } else if (e.key === "Enter") {
        OZ.Event.prevent(e);
        this.finishName(false);
    } else if (e.key === "Escape") {
        OZ.Event.prevent(e);
        this.finishName(true);
    }
};

SQL.Relation.prototype.clickAway = function (e) {
    if (!this.editing || this.dom.input.contains(e.target) || this.dom.handle.contains(e.target)) {
        return;
    }
    this.finishName(false);
};

SQL.Relation.prototype.finishName = function (cancel) {
    if (!this.editing) {
        return;
    }
    this.editing = false;
    this.editingWidth = 0;
    document.removeEventListener("pointerdown", this.outsideClick, true);
    if (!cancel) {
        this.name = this.dom.input.value.trim();
    }
    this.transitionControl();
    this.redraw();
    this.dom.input.setSelectionRange(0, 0);
    if (document.activeElement === this.dom.input) {
        this.dom.input.blur();
    }
};

SQL.Relation.prototype.transitionControl = function () {
    clearTimeout(this.transitionTimeout);
    this.dom.handle.classList.add("relation-control-transitioning");
    this.dom.input.classList.add("relation-control-transitioning");
    this.transitionTimeout = setTimeout(this.clearControlTransition.bind(this), 120);
};

SQL.Relation.prototype.clearControlTransition = function () {
    this.dom.handle.classList.remove("relation-control-transitioning");
    this.dom.input.classList.remove("relation-control-transitioning");
};

SQL.Relation.prototype.resizeName = function () {
    if (this.editing) {
        this.clearControlTransition();
        this.editingWidth = Math.max(
            24,
            this.measureNameWidth(this.dom.input.value) + 16
        );
        this.redrawControl(this.labelPosition[0], this.labelPosition[1]);
    }
};

SQL.Relation.prototype.measureNameWidth = function (name) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = getComputedStyle(this.dom.input).font;
    return Math.ceil(context.measureText(name).width);
};

SQL.Relation.prototype.redrawControl = function (x, y) {
    this.labelPosition = [x, y];
    const hasName = !!this.name;
    const editing = this.editing;
    const handleSize = hasName || editing ? 24 : 16;
    const pointX = x;
    const pointY = y;
    const controlWidth = editing
        ? this.editingWidth
        : (hasName ? this.measureNameWidth(this.name) + 16 : 16);
    if (this.owner.vector) {
        this.dom.handle.style.x = pointX - controlWidth / 2 + "px";
        this.dom.handle.style.y = pointY - handleSize / 2 + "px";
        this.dom.handle.style.width = controlWidth + "px";
        this.dom.handle.style.height = handleSize + "px";
    } else {
        this.dom.handle.style.left = pointX - controlWidth / 2 + "px";
        this.dom.handle.style.top = pointY - handleSize / 2 + "px";
        this.dom.handle.style.width = controlWidth + "px";
        this.dom.handle.style.height = handleSize + "px";
    }
    if (!editing) {
        this.dom.input.value = this.name;
    }
    this.dom.input.readOnly = !editing;
    this.dom.input.style.left = pointX - controlWidth / 2 + "px";
    this.dom.input.style.top = pointY - handleSize / 2 + "px";
    this.dom.input.style.width = controlWidth + "px";
    this.dom.input.style.height = handleSize + "px";
    this.dom.input.style.visibility = "";
};

SQL.Relation.prototype.redrawNormal = function (p1, p2, half) {
    if (this.owner.vector) {
        let str =
            "M " +
            p1[0] +
            " " +
            p1[1] +
            " C " +
            (p1[0] + half) +
            " " +
            p1[1] +
            " ";
        str += p2[0] - half + " " + p2[1] + " " + p2[0] + " " + p2[1];
        this.dom[0].setAttribute("d", str);
    } else {
        this.dom[0].style.left = p1[0] + "px";
        this.dom[0].style.top = p1[1] + "px";
        this.dom[0].style.width = half + "px";

        this.dom[1].style.left = p1[0] + half + "px";
        this.dom[1].style.top = Math.min(p1[1], p2[1]) + "px";
        this.dom[1].style.height =
            Math.abs(p1[1] - p2[1]) + CONFIG.RELATION_THICKNESS + "px";

        this.dom[2].style.left = p1[0] + half + 1 + "px";
        this.dom[2].style.top = p2[1] + "px";
        this.dom[2].style.width = half + "px";
    }
    this.redrawControl(p1[0] + half, (p1[1] + p2[1]) / 2);
};

SQL.Relation.prototype.redrawSide = function (p1, p2, x) {
    if (this.owner.vector) {
        let str = "M " + p1[0] + " " + p1[1] + " C " + x + " " + p1[1] + " ";
        str += x + " " + p2[1] + " " + p2[0] + " " + p2[1];
        this.dom[0].setAttribute("d", str);
    } else {
        this.dom[0].style.left = Math.min(x, p1[0]) + "px";
        this.dom[0].style.top = p1[1] + "px";
        this.dom[0].style.width = Math.abs(p1[0] - x) + "px";

        this.dom[1].style.left = x + "px";
        this.dom[1].style.top = Math.min(p1[1], p2[1]) + "px";
        this.dom[1].style.height =
            Math.abs(p1[1] - p2[1]) + CONFIG.RELATION_THICKNESS + "px";

        this.dom[2].style.left = Math.min(x, p2[0]) + "px";
        this.dom[2].style.top = p2[1] + "px";
        this.dom[2].style.width = Math.abs(p2[0] - x) + "px";
    }
    this.redrawControl(x, (p1[1] + p2[1]) / 2);
};

SQL.Relation.prototype.redraw = function () {
    /* draw connector */
    if (this.hidden) {
        return;
    }
    let t1 = this.row1.owner.dom.container;
    let t2 = this.row2.owner.dom.container;

    let l1 = t1.offsetLeft;
    let l2 = t2.offsetLeft;
    let r1 = l1 + t1.offsetWidth;
    let r2 = l2 + t2.offsetWidth;
    t1 =
        t1.offsetTop +
        this.row1.dom.container.offsetTop +
        Math.round(this.row1.dom.container.offsetHeight / 2);
    t2 =
        t2.offsetTop +
        this.row2.dom.container.offsetTop +
        Math.round(this.row2.dom.container.offsetHeight / 2);

    if (this.row1.owner.selected) {
        t1++;
        l1++;
        r1--;
    }
    if (this.row2.owner.selected) {
        t2++;
        l2++;
        r2--;
    }

    let p1;
    let p2;

    if (r1 < l2 || r2 < l1) {
        /* between tables */
        if (Math.abs(r1 - l2) < Math.abs(r2 - l1)) {
            p1 = [r1, t1];
            p2 = [l2, t2];
        } else {
            p1 = [r2, t2];
            p2 = [l1, t1];
        }
        const half = Math.floor((p2[0] - p1[0]) / 2);
        this.redrawNormal(p1, p2, half);
    } else {
        /* next to tables */
        let x = 0;
        if (Math.abs(l1 - l2) < Math.abs(r1 - r2)) {
            /* left of tables */
            p1 = [l1, t1];
            p2 = [l2, t2];
            x = Math.min(l1, l2) - CONFIG.RELATION_SPACING;
        } else {
            /* right of tables */
            p1 = [r1, t1];
            p2 = [r2, t2];
            x = Math.max(r1, r2) + CONFIG.RELATION_SPACING;
        }
        this.redrawSide(p1, p2, x);
    } /* line next to tables */
};

SQL.Relation.prototype.destroy = function () {
    clearTimeout(this.transitionTimeout);
    document.removeEventListener("pointerdown", this.outsideClick, true);
    this.row1.removeRelation(this);
    this.row2.removeRelation(this);
    for (let elm of this.dom) {
        elm.parentNode.removeChild(elm);
    }
    this.dom.handle.parentNode.removeChild(this.dom.handle);
    this.dom.input.parentNode.removeChild(this.dom.input);
};
