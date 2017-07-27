import { createSelector } from 'reselect';

import { getSwatchContainer } from './../dimensions/selector';

function getStopsData(stops, editing, containerDimenions) {
  const stopKeys = Object.keys(stops);
  const data = stopKeys.reduce((aggr, curr, index) => {
    const newAggr = { ...aggr };
    if (editing) {
      newAggr[curr] = parseFloat(curr, 10);
    } else {
      newAggr[curr] = parseFloat((index + 1) / stopKeys.length * 100, 10);
    }
    return newAggr;
  }, {});

  if (editing) {
    data.barOpacity = 1;
    data.width = containerDimenions.width;
  } else {
    data.width = stopKeys.length * 30;
    data.barOpacity = 0;
  }
  return data;
}

export const getStops = state => state.stops.values;
export const getStopsById = (state, props) => state.stops.values[props.id];

export const getEditingState = (state, props) => state.stops.editing === props.id;

export const getStopData = createSelector([getStopsById, getEditingState, getSwatchContainer], getStopsData);
