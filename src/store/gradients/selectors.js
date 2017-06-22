import { createSelector } from 'reselect'

export const getActiveId = state => state.gradients.active
export const getGradients = state => state.gradients.gradientValues

export const getActiveGradient = createSelector(
  [getActiveId, getGradients],
  (activeId, gradients) => gradients[activeId]
)

export const getGradientById = id =>
  createSelector([getGradients], gradients => {
    return gradients[id]
  })

export const getGradientData = (id, gradients, stops) => {
  return {
    angle: gradients.gradientValues[id].angle,
    stops: { ...stops.values[id] }
  }
}
