import styles from './yield-bar-base.scss.js';

var YieldBarEntryStyle = /* @__PURE__ */ ((YieldBarEntryStyle2) => {
  YieldBarEntryStyle2[YieldBarEntryStyle2["NONE"] = 0] = "NONE";
  YieldBarEntryStyle2[YieldBarEntryStyle2["GAIN"] = 1] = "GAIN";
  YieldBarEntryStyle2[YieldBarEntryStyle2["LOSS"] = 2] = "LOSS";
  return YieldBarEntryStyle2;
})(YieldBarEntryStyle || {});
class YieldBarBase extends Component {
  _yieldBarData = [];
  _yieldBarDeltas = [];
  set yieldBarData(data) {
    this._yieldBarData = data;
    this.update();
  }
  set yieldBarDeltas(deltas) {
    this._yieldBarDeltas = deltas;
    this.update();
  }
  update() {
    this.Root.innerHTML = "";
    for (const [index, entry] of this._yieldBarData.entries()) {
      this.addEntry(index, entry, this._yieldBarDeltas[index] ? this._yieldBarDeltas[index] : void 0);
    }
  }
  addEntry(index, entry, delta) {
    const outerContainer = document.createElement("div");
    outerContainer.className = "flex flex-col justify-end items-center";
    const container = document.createElement("div");
    container.className = `w-11 h-20 flex flex-col items-center justify-center self-end`;
    this.updateYieldBarEntryStyle(container, entry.style);
    if (index > 0) {
      outerContainer.classList.add("ml-2\\.5");
    }
    if (delta && delta.value != 0) {
      const deltaContainer = document.createElement("div");
      deltaContainer.className = "flex items-center justify-center w-11 h-6 mb-2 text-sm yield-bar-base__delta-value-bg";
      outerContainer.appendChild(deltaContainer);
      const deltaValue = document.createElement("div");
      deltaValue.style.letterSpacing = "-0.5px";
      if (delta.style == 1 /* GAIN */) {
        deltaValue.classList.add("text-positive-light");
      } else if (delta.style == 2 /* LOSS */) {
        deltaValue.classList.add("text-negative-light");
      }
      deltaValue.textContent = Locale.compose("LOC_UI_CITY_DETAILS_YIELD_ONE_DECIMAL", delta.value);
      deltaContainer.appendChild(deltaValue);
    }
    const icon = document.createElement("fxs-icon");
    icon.classList.add("mt-2", "size-8", "self-center");
    icon.setAttribute("data-icon-id", entry.type);
    container.appendChild(icon);
    const value = entry.value > 100 ? Math.trunc(entry.value) : Math.trunc(entry.value * 10) / 10;
    const valueText = document.createElement("div");
    valueText.classList.add("mb-2", "text-sm", "text-center", "font-fit-shrink");
    valueText.style.letterSpacing = "-0.5px";
    valueText.innerHTML = Locale.stylize("LOC_UI_YIELD_ONE_DECIMAL_NO_PLUS", value);
    container.appendChild(valueText);
    outerContainer.appendChild(container);
    this.Root.appendChild(outerContainer);
  }
  updateYieldBarEntryStyle(element, style) {
    element.classList.remove(
      "img-yield-container-positive",
      "img-yield-container-negative",
      "img-yield-container-neutral"
    );
    switch (style) {
      case 1 /* GAIN */:
        element.classList.add("img-yield-container-positive");
        break;
      case 2 /* LOSS */:
        element.classList.add("img-yield-container-negative");
        break;
      case 0 /* NONE */:
        element.classList.add("img-yield-container-neutral");
        break;
      default:
        style;
    }
  }
  onInitialize() {
    this.Root.classList.add("flex", "justify-between");
  }
  onAttributeChanged(name, oldValue, newValue) {
    switch (name) {
      case "data-yield-bar":
        this.yieldBarData = newValue == "" ? [] : JSON.parse(newValue);
        break;
      case "data-yield-deltas":
        this.yieldBarDeltas = newValue == "" ? [] : JSON.parse(newValue);
        break;
      default:
        super.onAttributeChanged(name, oldValue, newValue);
    }
  }
}
Controls.define("yield-bar-base", {
  createInstance: YieldBarBase,
  description: "",
  styles: [styles],
  attributes: [
    {
      name: "data-yield-bar",
      description: "JSON-fied block of YieldBarEntry used to generate yield bar"
    },
    {
      name: "data-yield-deltas",
      description: "JSON-fied block of YieldBarEntry used to generate yield bar deltas"
    }
  ]
});

export { YieldBarEntryStyle };
//# sourceMappingURL=yield-bar-base.js.map
