import LensManager from '../../../../core/ui/lenses/lens-manager.js';
import { YieldChangeVisualizer } from './yield-change-visualizer.js';
import { PlacePopulation } from '../../place-population/model-place-population.js';
import PlotWorkersManager, { PlotWorkersUpdatedEventName } from '../../plot-workers/plot-workers-manager.js';

const SPECIALIST_PIP_WRAP_AT = 6;
const SPECIALIST_PIP_X_OFFSET = 15;
const SPECIALIST_PIP_Y_INITIAL_OFFSET = 12;
const SPECIALIST_PIP_Y_OFFSET = 18;
const SPECIALIST_PIP_SHRINK_COUNT = 4;
const SPECIALIST_PIP_SHRINK_SCALE = 0.7;
const SPECIALIST_PIP_BLOCKED_ALPHA = 0.5;
const ICON_Z_OFFSET = 5;
const YIELD_CHANGE_OFFSET = { x: 0, y: -10, z: 0 };
class WorkerYieldsLensLayer {
  yieldSpritePadding = 11;
  yieldVisualizer = new YieldChangeVisualizer("WorkerYields");
  yieldIcons = /* @__PURE__ */ new Map();
  plotWorkerUpdatedListener = this.onPlotWorkerUpdate.bind(this);
  districtAddedToMapListener = this.onDistrictAddedToMap.bind(this);
  cacheIcons() {
    for (const y of GameInfo.Yields) {
      const icons = [];
      for (let i = 1; i < 6; ++i) {
        const icon = UI.getIconBLP(`${y.YieldType}_${i}`);
        icons.push(icon);
      }
      this.yieldIcons.set(y.$hash, icons);
    }
  }
  initLayer() {
    this.cacheIcons();
    this.yieldVisualizer.setVisible(false);
  }
  applyLayer() {
    this.realizeGrowthPlots();
    const cityID = PlotWorkersManager.cityID;
    const currentCity = cityID ? Cities.get(cityID) : null;
    if (currentCity && !currentCity.isTown) {
      this.realizeWorkablePlots();
      this.realizeBlockedPlots();
    }
    this.yieldVisualizer.setVisible(true);
    window.addEventListener(PlotWorkersUpdatedEventName, this.plotWorkerUpdatedListener);
    engine.on("DistrictAddedToMap", this.districtAddedToMapListener);
  }
  removeLayer() {
    this.yieldVisualizer.clear();
    this.yieldVisualizer.setVisible(false);
    window.removeEventListener(PlotWorkersUpdatedEventName, this.plotWorkerUpdatedListener);
    engine.off("DistrictAddedToMap", this.districtAddedToMapListener);
  }
  onPlotWorkerUpdate(event) {
    if (event.detail.location) {
      this.yieldVisualizer.clearPlot(event.detail.location);
      const info = PlotWorkersManager.allWorkerPlots.find((element) => {
        if (event.detail.location) {
          return element.PlotIndex == GameplayMap.getIndexFromLocation(event.detail.location);
        }
        return void 0;
      });
      if (!info) {
        console.error(
          "worker-yields-layer: onWorkerAdded() - failed to find workable plot for location " + event.detail.location
        );
        return;
      }
      this.updateSpecialistPlot(info);
    } else {
      this.realizeWorkablePlots();
    }
  }
  onDistrictAddedToMap(event) {
    this.yieldVisualizer.clearPlot(event.location);
    this.realizeGrowthPlots();
  }
  realizeGrowthPlots() {
    let plotsToCheck = null;
    if (PlotWorkersManager.cityID) {
      const city = Cities.get(PlotWorkersManager.cityID);
      if (city) {
        const excludeHidden = true;
        plotsToCheck = city.Growth?.getGrowthDomain(excludeHidden);
      }
    }
    if (plotsToCheck == null) {
      const width = GameplayMap.getGridWidth();
      const height = GameplayMap.getGridHeight();
      plotsToCheck = [];
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const revealedState = GameplayMap.getRevealedState(GameContext.localPlayerID, x, y);
          if (revealedState != RevealedStates.HIDDEN) {
            plotsToCheck.push(GameplayMap.getIndexFromXY(x, y));
          }
        }
      }
    }
    for (const plotIndex of plotsToCheck) {
      if (plotIndex !== null) {
        this.updatePlot(plotIndex);
      }
    }
  }
  realizeWorkablePlots() {
    for (const plot of PlotWorkersManager.workablePlots) {
      this.updateSpecialistPlot(plot);
    }
  }
  addPositiveYield(yieldVisualizer, location, yieldPillData, i, total, yieldSpritePadding) {
    const groupWidth = (total - 1) * yieldSpritePadding;
    const offset = { x: i * yieldSpritePadding + groupWidth / 2 - groupWidth, y: 6 };
    yieldVisualizer.addYieldChange(yieldPillData, location, offset, 4294967295, YIELD_CHANGE_OFFSET);
  }
  addNegativeYield(yieldVisualizer, location, yieldPillData, i, total, yieldSpritePadding) {
    const groupWidth = (total - 1) * yieldSpritePadding;
    const offset = { x: i * yieldSpritePadding + groupWidth / 2 - groupWidth, y: -10 };
    yieldVisualizer.addYieldChange(yieldPillData, location, offset, 4294967295, YIELD_CHANGE_OFFSET);
  }
  updateSpecialistPlot(info) {
    const yieldsToAdd = [];
    const maintenancesToAdd = [];
    info.NextYields.forEach((yieldNum, i) => {
      const yieldDefinition = GameInfo.Yields[i];
      const netYieldChange = Math.round((yieldNum - info.CurrentYields[i]) * 10) / 10;
      if (netYieldChange != 0 && yieldDefinition) {
        yieldsToAdd.push({ yieldDelta: netYieldChange, yieldType: yieldDefinition.YieldType });
      }
    });
    info.NextMaintenance.forEach((yieldNum, i) => {
      const yieldDefinition = GameInfo.Yields[i];
      const netYieldChange = Math.round((-yieldNum + info.CurrentMaintenance[i]) * 10) / 10;
      if (netYieldChange != 0 && yieldDefinition) {
        maintenancesToAdd.push({ yieldDelta: netYieldChange, yieldType: yieldDefinition.YieldType });
      }
    });
    const currentWorkers = info.NumWorkers;
    const workerCap = info.MaxWorkers;
    const location = GameplayMap.getLocationFromIndex(info.PlotIndex);
    for (let i = 0; i < workerCap; i++) {
      const offsetAndScale = this.getSpecialistPipOffsetsAndScale(i, workerCap - 1);
      if (i < currentWorkers) {
        const texture = "specialist_tile_pip_full";
        this.yieldVisualizer.addSprite(
          location,
          texture,
          {
            x: offsetAndScale.xOffset,
            y: offsetAndScale.yOffset,
            z: ICON_Z_OFFSET
          },
          { scale: offsetAndScale.scale }
        );
      } else {
        const texture = info.IsBlocked ? "specialist_tile_pip_bad" : "specialist_tile_pip_empty";
        this.yieldVisualizer.addSprite(
          location,
          texture,
          {
            x: offsetAndScale.xOffset,
            y: offsetAndScale.yOffset,
            z: ICON_Z_OFFSET
          },
          { scale: offsetAndScale.scale, alpha: info.IsBlocked ? SPECIALIST_PIP_BLOCKED_ALPHA : 1 }
        );
      }
    }
    if (!info.IsBlocked) {
      let positiveTotal = 0;
      let positiveIndex = 0;
      let negativeTotal = 0;
      let negativeIndex = 0;
      yieldsToAdd.forEach((yieldPillData) => {
        if (yieldPillData.yieldDelta >= 0) {
          positiveTotal++;
        } else {
          negativeTotal++;
        }
      });
      maintenancesToAdd.forEach((yieldPillData) => {
        if (yieldPillData.yieldDelta >= 0) {
          positiveTotal++;
        } else {
          negativeTotal++;
        }
      });
      yieldsToAdd.forEach((yieldPillData) => {
        if (yieldPillData.yieldDelta > 0) {
          this.addPositiveYield(
            this.yieldVisualizer,
            location,
            yieldPillData,
            positiveIndex++,
            positiveTotal,
            this.yieldSpritePadding
          );
        } else if (yieldPillData.yieldDelta < 0) {
          this.addNegativeYield(
            this.yieldVisualizer,
            location,
            yieldPillData,
            negativeIndex++,
            negativeTotal,
            this.yieldSpritePadding
          );
        }
      });
      maintenancesToAdd.forEach((yieldPillData) => {
        if (yieldPillData.yieldDelta > 0) {
          this.addPositiveYield(
            this.yieldVisualizer,
            location,
            yieldPillData,
            positiveIndex++,
            positiveTotal,
            this.yieldSpritePadding
          );
        } else if (yieldPillData.yieldDelta < 0) {
          this.addNegativeYield(
            this.yieldVisualizer,
            location,
            yieldPillData,
            negativeIndex++,
            negativeTotal,
            this.yieldSpritePadding
          );
        }
      });
    }
  }
  getSpecialistPipOffsetsAndScale(index, maxIndex) {
    const scale = maxIndex >= SPECIALIST_PIP_SHRINK_COUNT ? SPECIALIST_PIP_SHRINK_SCALE : 1;
    const numOfRows = Math.ceil((maxIndex + 1) / SPECIALIST_PIP_WRAP_AT);
    const columnIndex = Math.floor(index / SPECIALIST_PIP_WRAP_AT);
    const rowIndex = index % SPECIALIST_PIP_WRAP_AT;
    let numInRow = maxIndex;
    const maxInRow = (columnIndex + 1) * (SPECIALIST_PIP_WRAP_AT - 1) <= maxIndex;
    if (maxInRow) {
      numInRow = SPECIALIST_PIP_WRAP_AT;
    } else {
      numInRow = (maxIndex + 1) % SPECIALIST_PIP_WRAP_AT;
    }
    const startingSlotIconsXOffset = -(numInRow - 1) * SPECIALIST_PIP_X_OFFSET / 2;
    const xOffset = (startingSlotIconsXOffset + rowIndex * SPECIALIST_PIP_X_OFFSET) * scale;
    const yOffset = (numOfRows - (columnIndex + 1)) * SPECIALIST_PIP_Y_OFFSET * scale + SPECIALIST_PIP_Y_INITIAL_OFFSET;
    return { xOffset, yOffset, scale };
  }
  realizeBlockedPlots() {
    for (const plot of PlotWorkersManager.blockedPlots) {
      this.updateSpecialistPlot(plot);
    }
  }
  updatePlot(location) {
    const yieldsToAdd = [];
    const expandPlotData = PlacePopulation.getExpandPlots();
    const thisExpandPlotData = expandPlotData.find((data) => {
      return data.plotIndex == location;
    });
    if (!thisExpandPlotData) {
      return;
    }
    for (const workablePlotIndex of PlotWorkersManager.allWorkerPlotIndexes) {
      if (workablePlotIndex == location) {
        return;
      }
    }
    this.yieldVisualizer.clearPlot(location);
    const yields = PlotWorkersManager.cityID ? GameplayMap.getYieldsWithCity(location, PlotWorkersManager.cityID) : GameplayMap.getYields(location, GameContext.localPlayerID);
    if (yields) {
      for (const [yieldType, amount] of yields) {
        const yieldDef = GameInfo.Yields.lookup(yieldType);
        if (yieldDef) {
          if (amount >= 5) {
            yieldsToAdd.push({ yieldType: yieldDef.YieldType, yieldDelta: amount });
          } else {
            yieldsToAdd.push({ yieldType: yieldDef.YieldType, yieldDelta: amount });
          }
        }
      }
    }
    yieldsToAdd.forEach((yieldData, i) => {
      const groupWidth = (yieldsToAdd.length - 1) * this.yieldSpritePadding;
      const offset = { x: i * this.yieldSpritePadding + groupWidth / 2 - groupWidth, y: 6 };
      this.yieldVisualizer.addYieldChange(yieldData, location, offset, 4294967295, YIELD_CHANGE_OFFSET);
    });
  }
}
LensManager.registerLensLayer("fxs-worker-yields-layer", new WorkerYieldsLensLayer());
//# sourceMappingURL=worker-yields-layer.js.map
