import { getActiveGradient } from './selectors'

export const UPDATE_COLOR_STOP = 'gradients/UPDATE_COLOR_STOP'
export const UPDATE_ANGLE = 'gradients/UPDATE_ANGLE'
export const UPDATE_ACTIVE_ID = 'gradients/UPDATE_ACTIVE_ID'

export const updateColorStop = (id, colors) => (dispatch, getState) => {
  const state = getState()
  const { gradient } = getActiveGradient(state)
  const newGradient = Object.keys(gradient).reduce((aggr, curr, index) => {
    aggr[curr] = {
      ...gradient[curr],
      color: colors[index]
    }
    return aggr
  }, {})

  return dispatch({
    type: UPDATE_COLOR_STOP,
    payload: {
      id: state.gradients.active,
      newGradient
    }
  })
}

export const updateActiveId = () => (dispatch, getState) => {
  const { gradients: { active, gradientValues } } = getState()
  const gradientKeys = Object.keys(gradientValues)
  const next = gradientKeys.indexOf((active + 1).toString()) < 0 ? 0 : active
  const { id } = gradientValues[gradientKeys[next]]

  return dispatch({
    type: UPDATE_ACTIVE_ID,
    payload: {
      id
    }
  })
}
