import { createSelector } from 'reselect'

export const getActiveId = state => state.gradients.active
export const getGradients = state => state.gradients.gradientValues

export const getActiveGradient = createSelector(
  [getActiveId, getGradients],
  (activeId, gradients) => gradients[activeId]
)

export const getColors = createSelector([getActiveGradient], activeGradient => {
  const { gradient } = activeGradient
  return Object.keys(gradient).map(stop => gradient[stop].color)
})
