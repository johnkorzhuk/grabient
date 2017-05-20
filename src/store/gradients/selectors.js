import { createSelector } from 'reselect'
import { getStops } from './../stops/selectors'

export const getActiveId = state => state.gradients.active
export const getGradients = state => state.gradients.gradientValues

export const getActiveGradient = createSelector(
  [getActiveId, getGradients],
  (activeId, gradients) => gradients[activeId]
)

export const getGradientById = id =>
  createSelector([getStops, getGradients], (stops, gradients) => {
    return {
      ...gradients[id],
      gradient: {
        ...stops[id]
      }
    }
  })
