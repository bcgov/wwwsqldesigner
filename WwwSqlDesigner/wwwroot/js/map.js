/* --------------------- minimap ------------ */

SQL.Map = function (owner) {
    this.owner = owner;
    SQL.Visual.apply(this);
    this.dom.container = SQL.dom.get("minimap");
    this.width = this.dom.container.offsetWidth - 2;
    this.height = this.dom.container.offsetHeight - 2;

    this.dom.port = SQL.dom.create("div", { className: "port", zIndex: 1 });
    this.dom.container.appendChild(this.dom.port);
    this.sync = this.sync.bind(this);

    this.flag = false;
    this.sync();

    SQL.events.add(window, "resize", this.sync);
    SQL.events.add(window, "scroll", this.sync);
    SQL.events.add(this.dom.container, "mousedown", this.down.bind(this));
    SQL.events.add(this.dom.container, "touchstart", this.down.bind(this));
    SQL.events.add(this.dom.container, "touchmove", SQL.events.prevent);
};
SQL.Map.prototype = Object.create(SQL.Visual.prototype);

SQL.Map.prototype.down = function (e) {
    /* mousedown - move view and start drag */
    this.flag = true;
    this.dom.container.style.cursor = "move";
    const pos = SQL.dom.pos(this.dom.container);

    this.x = Math.round(pos[0] + this.offsetX + this.l + this.w / 2);
    this.y = Math.round(pos[1] + this.offsetY + this.t + this.h / 2);
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

    this.documentMove = SQL.events.add(document, eventMove, this.move.bind(this));
    this.documentUp = SQL.events.add(document, eventUp, this.up.bind(this));
};

SQL.Map.prototype.move = function (e) {
    /* mousemove */
    if (!this.flag) {
        return;
    }
    SQL.events.prevent(e);

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
    if (this.l + this.w + 4 + dx > this.mapWidth) {
        dx = this.mapWidth - 4 - this.l - this.w;
    }
    if (this.t + this.h + 4 + dy > this.mapHeight) {
        dy = this.mapHeight - 4 - this.t - this.h;
    }

    this.x += dx;
    this.y += dy;

    this.l += dx;
    this.t += dy;

    let left = this.l / this.scale;
    let top = this.t / this.scale;

    document.documentElement.scrollLeft = Math.round(left);
    document.documentElement.scrollTop = Math.round(top);

    this.redraw();
};

SQL.Map.prototype.up = function (e) {
    /* mouseup */
    this.flag = false;
    this.dom.container.style.cursor = "";
    SQL.events.remove(this.documentMove);
    SQL.events.remove(this.documentUp);
};

SQL.Map.prototype.sync = function () {
    /* when window changes, adjust map */
    this.width = this.dom.container.offsetWidth - 2;
    this.height = this.dom.container.offsetHeight - 2;
    const dims = SQL.dom.win();
    const scroll = SQL.dom.scroll();
    this.scale = Math.min(this.width / this.owner.width, this.height / this.owner.height);
    this.mapWidth = this.owner.width * this.scale;
    this.mapHeight = this.owner.height * this.scale;
    this.offsetX = (this.width - this.mapWidth) / 2;
    this.offsetY = (this.height - this.mapHeight) / 2;

    const w = dims[0] * this.scale - 4;
    const h = dims[1] * this.scale - 4;
    const x = scroll[0] * this.scale;
    const y = scroll[1] * this.scale;

    this.w = Math.round(w);
    this.h = Math.round(h);
    this.l = Math.round(x);
    this.t = Math.round(y);

    this.redraw();
};

SQL.Map.prototype.redraw = function () {
    this.dom.port.style.width = this.w + "px";
    this.dom.port.style.height = this.h + "px";
    this.dom.port.style.left = this.offsetX + this.l + "px";
    this.dom.port.style.top = this.offsetY + this.t + "px";
};
