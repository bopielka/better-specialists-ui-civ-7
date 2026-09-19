import { InputHandlerState } from '../input/input-support.js';
import ViewManager from '../views/view-manager.js';

const debug_showModeChanges = false;
const InterfaceModeChangedEventName = "interface-mode-changed";
class InterfaceModeChangedEvent extends CustomEvent {
  constructor(prevMode, newMode) {
    super(InterfaceModeChangedEventName, {
      detail: {
        prevMode,
        newMode
      }
    });
  }
}
class InterfaceModeReadyEvent extends CustomEvent {
  constructor() {
    super("interface-mode-ready");
  }
}
var InterfaceMode;
((InterfaceMode2) => {
  const UNSET_INTERFACE_MODE = "INTERFACEMODE_UNSET";
  const DEFAULT_INTERFACE_MODE = "INTERFACEMODE_DEFAULT";
  const InterfaceModeHandlers = /* @__PURE__ */ new Map();
  let isReady = false;
  let initMode = DEFAULT_INTERFACE_MODE;
  let currentInterfaceMode = UNSET_INTERFACE_MODE;
  let currentInterfaceParameters = void 0;
  function getInterfaceModeHandler(mode) {
    return InterfaceModeHandlers.get(mode) ?? null;
  }
  InterfaceMode2.getInterfaceModeHandler = getInterfaceModeHandler;
  function addHandler(mode, handler) {
    const definition = GameInfo.InterfaceModes.lookup(mode);
    if (definition == null) {
      console.warn(`Interface Mode '${mode}' not defined in database.`);
    }
    const oldHandler = InterfaceModeHandlers.get(mode);
    if (oldHandler != null) {
      console.warn("Replacing an existing interface mode handler.");
    }
    InterfaceModeHandlers.set(mode, handler);
  }
  InterfaceMode2.addHandler = addHandler;
  function getCurrent() {
    return currentInterfaceMode;
  }
  InterfaceMode2.getCurrent = getCurrent;
  function getParameters() {
    return currentInterfaceParameters;
  }
  InterfaceMode2.getParameters = getParameters;
  function switchTo(mode, parameters) {
    let success = false;
    if (!isReady) {
      if (parameters?.lazyInit == true) {
        initMode = mode;
        return false;
      }
      console.error(`Attempt to switch to an interface mode '${mode}' before startup completed.`);
      return false;
    }
    const definition = GameInfo.InterfaceModes.lookup(mode);
    if (definition == null) {
      console.warn(`Interface Mode '${mode}' not defined in Database.`);
      return false;
    }
    const handler = getInterfaceModeHandler(mode);
    if (handler == null) {
      console.error(`No handler registered for '${mode}'`);
      return false;
    }
    const prevHandler = getInterfaceModeHandler(currentInterfaceMode);
    if (prevHandler && prevHandler.canLeaveMode && !prevHandler.canLeaveMode(mode)) {
      return false;
    }
    if (handler.canEnterMode && !handler.canEnterMode(parameters)) {
      return false;
    }
    const prevMode = currentInterfaceMode;
    if (mode != currentInterfaceMode) {
      currentInterfaceMode = mode;
      currentInterfaceParameters = parameters;
      console.log(`UIInterfaceMode: from '${prevMode}' to '${mode}'.`);
      prevHandler?.transitionFrom(prevMode, mode);
      handler?.transitionTo(prevMode, mode, parameters);
      success = ViewManager.setCurrentByName(definition.ViewName);
      if (success) {
        window.dispatchEvent(new InterfaceModeChangedEvent(prevMode, currentInterfaceMode));
        if (debug_showModeChanges) {
          const GreenANSI = "\x1B[32m";
          const BlackOnGreenANSI = "\x1B[30m\x1B[42m";
          const ResetANSI = "\x1B[0m";
          console.log(
            GreenANSI + `IM.switchTo('${BlackOnGreenANSI}${mode}${ResetANSI}${GreenANSI}') success!   View: '${BlackOnGreenANSI}${definition.ViewName}${ResetANSI}${GreenANSI}'` + ResetANSI
          );
        }
      } else {
        console.warn(
          `Failed after chaning mode to '${mode}', failed to change the associated view with name '${definition.ViewName}'.`
        );
      }
    }
    return success;
  }
  InterfaceMode2.switchTo = switchTo;
  const MaxFrames = 5;
  let delayFrameCount = 0;
  function startup() {
    return new Promise((resolve, reject) => {
      const updateListener = (_timeStamp) => {
        delayFrameCount++;
        const handler = getInterfaceModeHandler(DEFAULT_INTERFACE_MODE);
        if (handler != null) {
          isReady = true;
          window.dispatchEvent(new InterfaceModeReadyEvent());
          resolve(switchTo(initMode));
        } else {
          console.warn(
            `Delaying startup of interface mode handler, because default mode isn't yet registered. frame: ${delayFrameCount}`
          );
          requestAnimationFrame(updateListener);
          if (delayFrameCount > MaxFrames) {
            console.error(
              `Unable to startup interface modes; more than ${MaxFrames} passed since called and a default mode has yet to be registered.`
            );
            reject();
          }
        }
      };
      updateListener(0);
    });
  }
  InterfaceMode2.startup = startup;
  function switchToDefault() {
    switchTo(DEFAULT_INTERFACE_MODE);
  }
  InterfaceMode2.switchToDefault = switchToDefault;
  function isInInterfaceMode(targetMode) {
    return currentInterfaceMode == targetMode;
  }
  InterfaceMode2.isInInterfaceMode = isInInterfaceMode;
  function allowsHotKeys() {
    const handler = getInterfaceModeHandler(currentInterfaceMode);
    if (!handler || !handler.allowsHotKeys) {
      return false;
    }
    return handler.allowsHotKeys();
  }
  InterfaceMode2.allowsHotKeys = allowsHotKeys;
  function handleInput(inputEvent) {
    if (inputEvent.type != "engine-input") {
      console.warn("Attempt to handle a non engine-input event to the interface mode handlers.");
      return InputHandlerState.Active;
    }
    const handler = getInterfaceModeHandler(currentInterfaceMode);
    if (!handler || !handler.handleInput) {
      return InputHandlerState.Active;
    }
    return handler.handleInput(inputEvent);
  }
  InterfaceMode2.handleInput = handleInput;
  function handleNavigation(navigationEvent) {
    if (navigationEvent.type != "navigate-input") {
      console.warn("Attempt to handle a non navigate-input event to the interface mode handlers.");
      return InputHandlerState.Active;
    }
    const handler = getInterfaceModeHandler(currentInterfaceMode);
    if (!handler || !handler.handleNavigation) {
      return InputHandlerState.Active;
    }
    return handler.handleNavigation(navigationEvent);
  }
  InterfaceMode2.handleNavigation = handleNavigation;
  function isInDefaultMode() {
    return currentInterfaceMode == DEFAULT_INTERFACE_MODE;
  }
  InterfaceMode2.isInDefaultMode = isInDefaultMode;
})(InterfaceMode || (InterfaceMode = {}));

export { InterfaceMode, InterfaceModeChangedEvent, InterfaceModeChangedEventName, InterfaceModeReadyEvent };
//# sourceMappingURL=interface-modes.js.map
