import { createSelector } from 'reselect'

import { getSwatchContainer } from './../dimensions/selector'

export const getStops = state => state.stops.values
export const getStopsById = (state, props) => state.stops.values[props.id]

export const getEditingState = (state, props) =>
  state.stops.editing === props.id

export const getStopData = createSelector(
  [getStopsById, getEditingState, getSwatchContainer],
  getStopsData
)

function getStopsData (stops, editing, containerDimenions) {
  const stopKeys = Object.keys(stops)
  let data = stopKeys.reduce((aggr, curr, index) => {
    if (editing) {
      aggr[curr] = parseFloat(curr, 10)
    } else {
      aggr[curr] = parseFloat((index + 1) / stopKeys.length * 100, 10)
    }
    return aggr
  }, {})

  if (editing) {
    data.barOpacity = 1
    data.width = containerDimenions.width
    console.log(containerDimenions.width)
  } else {
    data.width = stopKeys.length * 30
    data.barOpacity = 0
  }
  return data
}
