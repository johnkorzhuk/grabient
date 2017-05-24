import { createSelector } from 'reselect'

export const getStops = state => state.stops.values
export const getStopsById = (state, id) => state.stops.values[id]
export const getEditingState = state => state.stops.editing

export const getStopColors = id =>
  createSelector([getStops], stops => Object.values(stops[id]))

export const getStopsData = (id, containerDimenions) =>
  createSelector([getStops, getEditingState], (stops, editing) => {
    return getAnimationData(Object.keys(stops[id]), editing, containerDimenions)
  })

function getAnimationData (stops, editing, containerDimenions) {
  let data = stops.reduce((aggr, curr, index) => {
    if (editing) {
      aggr[curr] = parseFloat(curr, 10)
    } else {
      aggr[curr] = parseFloat((index + 1) / stops.length * 100, 10)
    }
    return aggr
  }, {})

  if (editing) {
    data.barOpacity = 1
    data.width = containerDimenions.width
  } else {
    data.width = stops.length * 30
    data.barOpacity = 0
  }

  return data
}
