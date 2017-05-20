import { createSelector } from 'reselect'

export const getStops = state => state.stops.values
export const getStopsById = (state, id) => state.stops.values[id]

export const getStopColors = id =>
  createSelector([getStops], stops => Object.values(stops[id]))
