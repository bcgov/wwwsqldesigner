SQL.MapTools = function (owner) {
    this.owner = owner;
    this.dom = {
        container: OZ.$("maptools"),
        details: OZ.$("legendtools"),
        content: OZ.$("maptoolcontent"),
        toggle: OZ.$("maptoggle"),
    };
    this.animating = false;
    OZ.Event.add(this.dom.toggle, "click", this.click.bind(this));
};

SQL.MapTools.prototype.sync = function () {
    if (this.dom.details.open) {
        this.dom.container.style.height = this.getExpandedHeight() + "px";
    } else {
        this.dom.container.style.height = this.getCollapsedHeight() + "px";
    }
};

SQL.MapTools.prototype.click = function (e) {
    e.preventDefault();
    if (this.animating) {
        return;
    }
    if (!this.dom.details.open) {
        const start = this.getCollapsedHeight();
        this.owner.toolbarToggle._switch(false);
        this.dom.details.open = true;
        this.owner.map.sync();
        this.animate(start, this.getExpandedHeight());
        return;
    }

    this.close();
};

SQL.MapTools.prototype.close = function () {
    if (!this.dom.details.open || this.animating) {
        return;
    }
    this.animate(this.dom.container.offsetHeight, this.getCollapsedHeight(), () => {
        this.dom.details.open = false;
        this.dom.container.style.height = this.getCollapsedHeight() + "px";
    });
};

SQL.MapTools.prototype.getExpandedHeight = function () {
    return this.dom.content.offsetHeight + this.getCollapsedHeight();
};

SQL.MapTools.prototype.getCollapsedHeight = function () {
    return this.owner.map.dom.container.offsetHeight + this.dom.toggle.offsetHeight;
};

SQL.MapTools.prototype.animate = function (start, end, finished) {
    if (!this.dom.container.animate) {
        this.dom.container.style.height = end + "px";
        if (finished) {
            finished();
        }
        return;
    }
    this.animating = true;
    this.dom.container.style.height = start + "px";
    this.dom.container.style.overflow = "hidden";
    const animation = this.dom.container.animate([
        { height: start + "px" },
        { height: end + "px" },
    ], { duration: 180, easing: "ease-in-out" });
    animation.onfinish = () => {
        this.dom.container.style.height = end + "px";
        this.dom.container.style.overflow = "";
        this.animating = false;
        if (finished) {
            finished();
        }
    };
};
