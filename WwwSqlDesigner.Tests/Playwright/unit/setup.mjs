globalThis.document = {
    createElement: () => ({ style: {} }),
    createTextNode: (value) => ({ textContent: value }),
    getElementById: () => null
};
globalThis.DOMParser = class {
    parseFromString(xml) {
        return { documentElement: { xml } };
    }
};
globalThis.window = { scrollX: 10, scrollY: 20 };
