/* --------------------- minimap ------------ */

SQL.Map = function (owner) {
    this.owner = owner;
    SQL.Visual.apply(this);
    this.dom.container = OZ.$("minimap");
    this.width = this.dom.container.offsetWidth - 2;
    this.height = this.dom.container.offsetHeight - 2;

    this.dom.port = OZ.DOM.elm("div", { className: "port", zIndex: 1 });
    this.dom.container.appendChild(this.dom.port);
    this.sync = this.sync.bind(this);

    this.flag = false;
    this.sync();

    OZ.Event.add(window, "resize", this.sync);
    OZ.Event.add(window, "scroll", this.sync);
    OZ.Event.add(this.dom.container, "mousedown", this.down.bind(this));
    OZ.Event.add(this.dom.container, "touchstart", this.down.bind(this));
    OZ.Event.add(this.dom.container, "touchmove", OZ.Event.prevent);
};
SQL.Map.prototype = Object.create(SQL.Visual.prototype);

SQL.Map.prototype.down = function (e) {
    /* mousedown - move view and start drag */
    this.flag = true;
    this.dom.container.style.cursor = "move";
    const pos = OZ.DOM.pos(this.dom.container);

    this.x = Math.round(pos[0] + this.l + this.w / 2);
    this.y = Math.round(pos[1] + this.t + this.h / 2);
    this.move(e);

    let eventMove = "";
    let eventUp = "";

    if (e.type == "touchstart") {
        eventMove = "touchmove";
        eventUp = "touchend";
    } else {
        eventMove = "mousemove";
        eventUp = "mouseup";
    }

    this.documentMove = OZ.Event.add(document, eventMove, this.move.bind(this));
    this.documentUp = OZ.Event.add(document, eventUp, this.up.bind(this));
};

SQL.Map.prototype.move = function (e) {
    /* mousemove */
    if (!this.flag) {
        return;
    }
    OZ.Event.prevent(e);

    let event;
    if (e.type.match(/touch/)) {
        if (e.touches.length > 1) {
            return;
        }
        event = e.touches[0];
    } else {
        event = e;
    }

    let dx = event.clientX - this.x;
    let dy = event.clientY - this.y;
    if (this.l + dx < 0) {
        dx = -this.l;
    }
    if (this.t + dy < 0) {
        dy = -this.t;
    }
    if (this.l + this.w + 4 + dx > this.width) {
        dx = this.width - 4 - this.l - this.w;
    }
    if (this.t + this.h + 4 + dy > this.height) {
        dy = this.height - 4 - this.t - this.h;
    }

    this.x += dx;
    this.y += dy;

    this.l += dx;
    this.t += dy;

    let coefX = this.width / this.owner.width;
    let coefY = this.height / this.owner.height;
    let left = this.l / coefX;
    let top = this.t / coefY;

    document.documentElement.scrollLeft = Math.round(left);
    document.documentElement.scrollTop = Math.round(top);

    this.redraw();
};

SQL.Map.prototype.up = function (e) {
    /* mouseup */
    this.flag = false;
    this.dom.container.style.cursor = "";
    OZ.Event.remove(this.documentMove);
    OZ.Event.remove(this.documentUp);
};

SQL.Map.prototype.sync = function () {
    /* when window changes, adjust map */
    const dims = OZ.DOM.win();
    const scroll = OZ.DOM.scroll();
    const scaleX = this.width / this.owner.width;
    const scaleY = this.height / this.owner.height;

    const w = dims[0] * scaleX - 4 - 0;
    const h = dims[1] * scaleY - 4 - 0;
    const x = scroll[0] * scaleX;
    const y = scroll[1] * scaleY;

    this.w = Math.round(w);
    this.h = Math.round(h);
    this.l = Math.round(x);
    this.t = Math.round(y);

    this.redraw();
};

SQL.Map.prototype.redraw = function () {
    this.dom.port.style.width = this.w + "px";
    this.dom.port.style.height = this.h + "px";
    this.dom.port.style.left = this.l + "px";
    this.dom.port.style.top = this.t + "px";
};
