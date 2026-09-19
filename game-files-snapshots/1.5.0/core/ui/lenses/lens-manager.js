import { createSignal } from '../../vendor/solid-js/dist/solid.js';
import { Catalog } from '../utilities/utility-serialize.js';

const LensLayerEnabledEventName = "lens-event-layer-enabled";
const LensLayerDisabledEventName = "lens-event-layer-disabled";
class LensLayerEvent extends CustomEvent {
  constructor(name, layer) {
    super(name, {
      bubbles: false,
      cancelable: false,
      detail: { layer }
    });
  }
}
const LensActivationEventName = "lens-event-active-lens";
class LensActivationEvent extends CustomEvent {
  constructor(prevLens, activeLens, hasLegend) {
    super(LensActivationEventName, {
      detail: {
        activeLens,
        prevLens,
        hasLegend
      }
    });
  }
}
const LENS_CATALOG_VERSION = 1;
const LENS_CATALOG_NAME = "LensManagerCatalog";
const LENS_CATALOG_OBJECT_NAME = "tracked-lens";
const ENABLED_LAYERS_CATALOG_OBJECT_ID = "enabled";
class LensManagerSingleton {
  catalogs = [];
  currentCatalog;
  playerID;
  showDebugInfo = false;
  lenses = /* @__PURE__ */ new Map();
  layers = /* @__PURE__ */ new Map();
  previousLens = void 0;
  activeLensGetter;
  activeLensSetter;
  get activeLens() {
    return this.activeLensGetter();
  }
  set activeLens(value) {
    this.activeLensSetter(value);
  }
  constructor() {
    const [activeLensGetter, activeLensSetter] = createSignal(void 0);
    this.activeLensGetter = activeLensGetter;
    this.activeLensSetter = activeLensSetter;
    this.playerID = GameContext.localPlayerID;
    this.currentCatalog = new Catalog({
      name: LENS_CATALOG_NAME,
      version: LENS_CATALOG_VERSION,
      player: Configuration.getGame().isHotseat ? Players.get(this.playerID) : null
    });
    this.catalogs[this.playerID] = this.currentCatalog;
    if (Configuration.getGame().isHotseat) {
      engine.on("LocalPlayerChanged", this.onLocalPlayerChanged, this);
    }
  }
  enabledLayers = /* @__PURE__ */ new Set();
  registerLens(lensType, lens) {
    if (this.lenses.has(lensType)) {
      console.error(`lens-manager: Attempted to add duplicate lens type: ${lensType}`);
      return;
    }
    this.lenses.set(lensType, lens);
  }
  registerLensLayer(layerType, layer) {
    if (this.layers.has(layerType)) {
      console.error(`lens-manager: Attempted to add duplicate layer type: ${layerType}`);
      return;
    }
    layer.initLayer();
    this.layers.set(layerType, layer);
    const lens = this.activeLens ? this.lenses.get(this.activeLens) : void 0;
    if (lens) {
      if (lens.activeLayers.has(layerType)) {
        this.enableLayer(layerType);
      }
    } else if (this.showDebugInfo) {
      console.log(`lens-manager: Failed to find '${this.activeLens}' during registerLensLayer.`);
    }
    if (this.getLayerOption(layerType) != layerType) {
      const enable = this.readTrackedLayer(layerType);
      const hasLayer = lens?.activeLayers.has(layerType);
      if (enable && !hasLayer) {
        this.enableLayer(layerType);
      } else if (!enable && hasLayer) {
        this.disableLayer(layerType);
      } else {
      }
    }
  }
  getActiveLens() {
    if (this.activeLens === void 0) {
      console.error(`lens-manager: No active lens has been set yet`);
    }
    return this.activeLens;
  }
  setActiveLens(type) {
    if (this.activeLens) {
      this.previousLens = this.activeLens;
    }
    if (type === this.activeLens) {
      return true;
    }
    const lens = this.lenses.get(type);
    if (lens == void 0) {
      console.error(`lens-manager: Failed to find lens for type ${type}`);
      return false;
    }
    if (this.activeLens !== void 0) {
      const prevLens = this.lenses.get(this.activeLens);
      if (prevLens != void 0) {
        if (!prevLens.skipCachingEnabledLayers) {
          prevLens.lastEnabledLayers = this.getEnabledLayers();
          prevLens.lastEnabledLayersPlayerID = this.playerID;
        }
      }
    } else {
      this.resetLayersFromSerialize();
    }
    const prevLensString = this.activeLens;
    this.activeLens = type;
    if (this.showDebugInfo) {
      console.info(`lens-manager: Leaving '${prevLensString}' lens.`);
      console.info(`lens-manager: Entering '${this.activeLens}' lens.`);
    }
    const nextLensLayers = (lens.lastEnabledLayers && lens.lastEnabledLayersPlayerID == this.playerID ? lens.lastEnabledLayers : void 0) ?? this.getActiveLayers(lens);
    const nextAllowedLayers = lens.allowedLayers;
    for (const layerType of lens.activeLayers) {
      const layer = this.layers.get(layerType);
      if (layer != void 0 && typeof layer.getOptionName === "undefined") {
        if (!nextLensLayers.has(layerType)) {
          console.error(`lens-manager: Missing active layer '${layerType}' for lens '${this.activeLens}'`);
          nextLensLayers.add(layerType);
        }
      }
    }
    const canBlend = lens.blendEnabledLayersOnTransition !== false || lens.lastEnabledLayers == null;
    for (const layerType of this.enabledLayers) {
      const layer = this.layers.get(layerType);
      if (layer == void 0) {
        console.error(`lens-manager: Failed to find '${layerType}' while trying to disable inactive layers`);
        continue;
      }
      if (!nextLensLayers.has(layerType) && (!canBlend || !nextAllowedLayers.has(layerType))) {
        this.disableLayer(layerType);
      }
    }
    this.enableLayers(nextLensLayers);
    const hasLegend = lens?.hasLegend ?? false;
    window.dispatchEvent(new LensActivationEvent(prevLensString, this.activeLens, hasLegend));
    return true;
  }
  restorePreviousLens() {
    if (this.previousLens) {
      this.setActiveLens(this.previousLens);
      this.previousLens = void 0;
    } else {
      console.error(`lens-manager: No previous lens has been set`);
    }
  }
  getActiveLayers(lens) {
    const activeLayers = new Set(lens.activeLayers);
    if (lens.useUserConfig) {
      for (const layer of this.layers) {
        const layerName = layer[0];
        const optionID = this.getLayerOption(layerName);
        if (optionID != layerName) {
          const shouldEnable = UI.getOption("user", "GamePlay", optionID) == 1;
          if (shouldEnable && !activeLayers.has(layerName)) {
            activeLayers.add(layerName);
          } else if (!shouldEnable && activeLayers.has(layerName)) {
            activeLayers.delete(layerName);
          }
        }
      }
    }
    return activeLayers;
  }
  enableLayers(layerTypes) {
    if (this.activeLens) {
      this.previousLens = this.activeLens;
    }
    for (const layerType of layerTypes) {
      this.enableLayer(layerType);
    }
  }
  enableLayer(layerType) {
    const layer = this.layers.get(layerType);
    if (layer == void 0) {
      console.error(`lens-manager: enableLayer failed to find lens layer for type '${layerType}'`);
      return false;
    }
    if (this.enabledLayers.has(layerType)) {
      if (this.showDebugInfo) {
        console.info(`lens-manager: Lens layer '${layerType}' is already enabled!`);
      }
      return false;
    }
    if (this.showDebugInfo) {
      console.info(`lens-manager: Enabling '${layerType}' layer`);
    }
    this.enabledLayers.add(layerType);
    layer.applyLayer();
    this.writeEnabledLayers();
    window.dispatchEvent(new LensLayerEvent(LensLayerEnabledEventName, layerType));
    return true;
  }
  disableLayer(layerType) {
    const layer = this.layers.get(layerType);
    if (layer == void 0) {
      console.error(`lens-manager: disableLayer failed to find lens layer for type '${layerType}'`);
      return false;
    }
    if (this.enabledLayers.has(layerType) == false) {
      if (this.showDebugInfo) {
        console.warn(`lens-manager: Lens layer '${layerType}' is already disabled!`);
      }
      return false;
    }
    if (this.showDebugInfo) {
      console.info(`lens-manager: Disabling '${layerType}' layer`);
    }
    this.enabledLayers.delete(layerType);
    layer.removeLayer();
    this.writeEnabledLayers();
    window.dispatchEvent(new LensLayerEvent(LensLayerDisabledEventName, layerType));
    return true;
  }
  getLayerOption(layerType) {
    const layer = this.layers.get(layerType);
    if (layer == void 0) {
      console.error(`lens-manager: enableLayer failed to find lens layer for type '${layerType}'`);
      return "";
    }
    if (typeof layer.getOptionName !== "undefined") {
      return layer.getOptionName();
    }
    return layerType;
  }
  /**
   * toggleLayer toggles a layer on or off
   *
   * @param layerType The name of layer to toggle
   * @param force If true, forces the layer to be enabled. If false, forces the layer to be disabled. If undefined, toggles the layer.
   *
   * @returns true if the layer was toggled, false if the layer was already in the desired state
   */
  toggleLayer(layerType, options) {
    const layer = this.layers.get(layerType);
    if (layer == void 0) {
      console.error(`lens-manager: toggleLayer failed to find lens layer for type '${layerType}'`);
      return false;
    }
    const force = options?.force;
    const serialize = options?.serialize === true;
    const isEnabled = this.enabledLayers.has(layerType);
    const enable = force ?? !isEnabled;
    let successful = true;
    if (enable) {
      successful = this.enableLayer(layerType);
    } else {
      successful = this.disableLayer(layerType);
    }
    if (successful && serialize === true) {
      const id = LensManager.getLayerOption(layerType);
      if (id != layerType) {
        this.writeTrackedLayer(id, enable);
      }
    }
    return successful;
  }
  isLayerEnabled(layerType) {
    const layer = this.layers.get(layerType);
    if (layer == void 0) {
      console.error(`lens-manager: isLayerEnabled failed to find lens layer for type '${layerType}'`);
      return false;
    }
    return this.enabledLayers.has(layerType);
  }
  /**
   * Returns the serialized state of the lens layer, if one exists.
   * @param layerType Name of the layer to look up.
   * @returns true if set to enabled, false if disabled, or undefined if no entry.
   */
  getSerializedState(layerType) {
    const id = LensManager.getLayerOption(layerType);
    if (id != layerType) {
      return this.readTrackedLayer(id);
    }
    return void 0;
  }
  readTrackedLayer(layerID) {
    if (Configuration.getGame().isHotseat) {
      const obj = this.currentCatalog.getObject(LENS_CATALOG_OBJECT_NAME);
      const value = !!obj.read(layerID);
      return value;
    }
    return UI.getOption("user", "GamePlay", layerID) == 1;
  }
  writeTrackedLayer(layerID, enable) {
    if (Configuration.getGame().isHotseat) {
      const obj = this.currentCatalog.getObject(LENS_CATALOG_OBJECT_NAME);
      obj.write(layerID, enable);
    } else {
      UI.setOption("user", "GamePlay", layerID, enable ? 1 : 0);
      Configuration.getUser().saveCheckpoint();
    }
  }
  writeEnabledLayers() {
    if (!this.activeLens) {
      return;
    }
    const obj = this.currentCatalog.getObject(this.activeLens);
    const enabledLayers = Array.from(this.enabledLayers);
    if (enabledLayers && enabledLayers.length > 0) {
      obj.write(ENABLED_LAYERS_CATALOG_OBJECT_ID, enabledLayers.join(":"));
    } else {
      obj.write(ENABLED_LAYERS_CATALOG_OBJECT_ID, "");
    }
  }
  getEnabledLayers() {
    if (!this.activeLens) {
      return;
    }
    const obj = this.currentCatalog.getObject(this.activeLens);
    const enabledLayers = obj.read(ENABLED_LAYERS_CATALOG_OBJECT_ID);
    const enabledLayersString = String(enabledLayers);
    if (enabledLayers && enabledLayersString.length > 0) {
      const array = enabledLayersString.split(":");
      return new Set(array);
    } else {
      return void 0;
    }
  }
  resetLayersFromSerialize() {
    this.layers.forEach((_layer, layerType) => {
      const isLayerEnabled = LensManager.getSerializedState(layerType) === true;
      if (isLayerEnabled) {
        this.enableLayer(layerType);
      } else {
        this.disableLayer(layerType);
      }
    });
  }
  onLocalPlayerChanged() {
    this.playerID = GameContext.localPlayerID;
    if (this.catalogs[this.playerID] == void 0) {
      this.currentCatalog = new Catalog({
        name: LENS_CATALOG_NAME,
        version: LENS_CATALOG_VERSION,
        player: Players.get(this.playerID)
      });
      this.catalogs[this.playerID] = this.currentCatalog;
    } else {
      this.currentCatalog = this.catalogs[this.playerID];
    }
    this.resetLayersFromSerialize();
  }
}
const LensManager = new LensManagerSingleton();

export { LensActivationEvent, LensActivationEventName, LensLayerDisabledEventName, LensLayerEnabledEventName, LensLayerEvent, LensManager as default };
//# sourceMappingURL=lens-manager.js.map
