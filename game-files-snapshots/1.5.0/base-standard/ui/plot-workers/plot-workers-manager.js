import { ComponentID } from '../../../core/ui/utilities/utilities-component-id.js';

const PlotWorkersHoveredPlotChangedEventName = "population-placement-hovered-plot-changed";
class PlotWorkersHoveredPlotChangedEvent extends CustomEvent {
  constructor() {
    super(PlotWorkersHoveredPlotChangedEventName, { bubbles: false, cancelable: true });
  }
}
const PlotWorkersUpdatedEventName = "plot-workers-updated";
class PlotWorkersUpdatedEvent extends CustomEvent {
  constructor(location) {
    super(PlotWorkersUpdatedEventName, { bubbles: false, cancelable: true, detail: { location } });
  }
}
class PlotWorkersManagerClass {
  static instance = null;
  _cityID = null;
  get cityID() {
    return this._cityID;
  }
  _allWorkerPlots = [];
  get allWorkerPlots() {
    return this._allWorkerPlots;
  }
  _allWorkerPlotIndexes = [];
  get allWorkerPlotIndexes() {
    return this._allWorkerPlotIndexes;
  }
  _workablePlots = [];
  get workablePlots() {
    return this._workablePlots;
  }
  _workablePlotIndexes = [];
  get workablePlotIndexes() {
    return this._workablePlotIndexes;
  }
  _blockedPlots = [];
  get blockedPlots() {
    return this._blockedPlots;
  }
  _blockedPlotIndexes = [];
  get blockedPlotIndexes() {
    return this._blockedPlotIndexes;
  }
  _hoveredPlotIndex = null;
  get hoveredPlotIndex() {
    return this._hoveredPlotIndex;
  }
  set hoveredPlotIndex(plotIndex) {
    if (this._hoveredPlotIndex == plotIndex) {
      return;
    }
    if (plotIndex != null && this.isPlotIndexSelectable(plotIndex)) {
      this._hoveredPlotIndex = plotIndex;
    } else {
      this._hoveredPlotIndex = null;
    }
    window.dispatchEvent(new PlotWorkersHoveredPlotChangedEvent());
  }
  _cityWorkerCap = 0;
  get cityWorkerCap() {
    return this._cityWorkerCap;
  }
  constructor() {
    if (PlotWorkersManagerClass.instance) {
      console.error(
        "Only one instance of the diplomacy manager class exist at a time, second attempt to create one."
      );
    }
    PlotWorkersManagerClass.instance = this;
    engine.on("WorkerAdded", this.onWorkerAdded);
  }
  reset() {
    this._cityID = null;
    this._allWorkerPlots = [];
    this._allWorkerPlotIndexes = [];
    this._workablePlots = [];
    this._workablePlotIndexes = [];
    this._blockedPlots = [];
    this._blockedPlotIndexes = [];
    this._hoveredPlotIndex = null;
    this._cityWorkerCap = 0;
  }
  initializeWorkersData(cityID) {
    this.reset();
    const city = Cities.get(cityID);
    if (!city?.Workers) {
      console.error(
        "plot-workers-manager: Unable to fetch valid city object for city with ID: " + ComponentID.toLogString(cityID)
      );
      return;
    }
    this._cityID = cityID;
    this.update();
  }
  update() {
    if (!this._cityID) {
      return;
    }
    const city = Cities.get(this._cityID);
    if (!city?.Workers) {
      console.error(
        "plot-workers-manager: Unable to fetch valid city object for city with ID: " + ComponentID.toLogString(this._cityID)
      );
      return;
    }
    this._allWorkerPlotIndexes = [];
    this._workablePlots = [];
    this._workablePlotIndexes = [];
    this._blockedPlots = [];
    this._blockedPlotIndexes = [];
    this._allWorkerPlots = city.Workers.GetAllPlacementInfo();
    this._allWorkerPlots.forEach((info) => {
      this._allWorkerPlotIndexes.push(info.PlotIndex);
      if (info.IsBlocked) {
        this._blockedPlots.push(info);
        this._blockedPlotIndexes.push(info.PlotIndex);
      } else {
        this._workablePlots.push(info);
        this._workablePlotIndexes.push(info.PlotIndex);
      }
    });
    this._cityWorkerCap = city.Workers.getCityWorkerCap();
  }
  isPlotIndexSelectable(plotIndex) {
    return this._allWorkerPlotIndexes.find((index) => {
      return index == plotIndex;
    }) != void 0;
  }
  onWorkerAdded = (data) => {
    if (!ComponentID.isMatch(this._cityID, data.cityID)) {
      return;
    }
    this.update();
    window.dispatchEvent(new PlotWorkersUpdatedEvent(data.location));
  };
}
const PlotWorkersManager = new PlotWorkersManagerClass();

export { PlotWorkersHoveredPlotChangedEvent, PlotWorkersHoveredPlotChangedEventName, PlotWorkersUpdatedEvent, PlotWorkersUpdatedEventName, PlotWorkersManager as default };
//# sourceMappingURL=plot-workers-manager.js.map
