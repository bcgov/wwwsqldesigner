function _(str) {
    /* getText */
    if (!(str in window.LOCALE)) {
        return str;
    }
    return window.LOCALE[str];
}

var DATATYPES = false;
var LOCALE = {};
const SQL = {
    _subscribers: {},

    publish: function (message, publisher, data) {
        const subscribers = this._subscribers[message] || [];
        const obj = {
            target: publisher,
            data: data,
        };
        subscribers.forEach(function (subscriber) {
            subscriber(obj);
        });
    },

    subscribe: function (message, subscriber) {
        if (!(message in this._subscribers)) {
            this._subscribers[message] = [];
        }
        const index = this._subscribers[message].indexOf(subscriber);
        if (index == -1) {
            this._subscribers[message].push(subscriber);
        }
    },

    unsubscribe: function (message, subscriber) {
        const index = this._subscribers[message].indexOf(subscriber);
        if (index > -1) {
            this._subscribers[message].splice(index, 1);
        }
    },

    escape: function (str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/>/g, "&gt;")
            .replace(/</g, "&lt;");
    },

    escapeXmlText: function (str) {
        return this.escape(str).replace(/\r/g, "&#13;");
    },

    hasXmlContent: function (value) {
        return /[^ \t\r\n]/.test(String(value || ""));
    },

    dom: {
        get: function (id) {
            return document.getElementById(id);
        },

        create: function (name, options) {
            const element = document.createElement(name);
            for (const property in options || {}) {
                const value = options[property];
                if (property === "class") {
                    element.className = value;
                } else if (property in element) {
                    element[property] = value;
                } else {
                    $(element).css(property, value);
                }
            }
            return element;
        },

        text: function (value) {
            return document.createTextNode(value);
        },

        clear: function (element) {
            while (element.firstChild) {
                element.removeChild(element.firstChild);
            }
        },

        append: function () {
            if (arguments.length === 1) {
                const group = arguments[0];
                $(group[0]).append(group.slice(1));
                return;
            }
            for (const group of arguments) {
                SQL.dom.append(group);
            }
        },

        pos: function (element) {
            const rect = element.getBoundingClientRect();
            return [rect.left, rect.top];
        },

        scroll: function () {
            return [window.scrollX, window.scrollY];
        },

        win: function () {
            return [document.documentElement.clientWidth, document.documentElement.clientHeight];
        },

        addClass: function (element, className) {
            $(typeof element === "string" ? SQL.dom.get(element) : element).addClass(className);
        },

        removeClass: function (element, className) {
            $(typeof element === "string" ? SQL.dom.get(element) : element).removeClass(className);
        },
    },

    style: {
        set: function (element, styles) {
            $(element).css(styles);
        },
    },

    events: {
        add: function (target, event, handler) {
            const element = typeof target === "string" ? SQL.dom.get(target) : target;
            $(element).on(event, handler);
            return { element, event, handler };
        },

        remove: function (registration) {
            if (registration) {
                $(registration.element).off(registration.event, registration.handler);
            }
        },

        stop: function (event) {
            event.stopPropagation();
        },

        prevent: function (event) {
            event.preventDefault();
        },

        target: function (event) {
            return event.target;
        },
    },

    request: function (url, callback, options) {
        const settings = options || {};
        const request = $.ajax({
            url: url,
            method: (settings.method || "get").toUpperCase(),
            data: settings.data || null,
            headers: settings.headers || {},
            dataType: settings.xml ? "xml" : undefined,
        });
        request.always(function () {
            const headers = {};
            const rawHeaders = request.getAllResponseHeaders();
            if (rawHeaders) {
                rawHeaders.split(/[\r\n]/).forEach(function (line) {
                    const match = line.match(/^([^:]+): *(.*)$/);
                    if (match) {
                        headers[match[1]] = match[2];
                    }
                });
            }
            const data = settings.xml ? request.responseXML : request.responseText;
            if (callback) {
                callback(data, request.status, headers);
            }
        });
        return request;
    },
};

window.onbeforeunload = function (e) {
    return ""; /* some browsers will show this text, some won't. */
};
