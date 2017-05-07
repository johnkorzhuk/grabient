export const UPDATE_COLOR_STOP = 'gradients/UPDATE_COLOR_STOP'
export const UPDATE_ANGLE = 'gradients/UPDATE_ANGLE'

export const updateColorStop = (id, colors) => (dispatch, getState) => {
  const { gradients: { gradientValues } } = getState()
  const { gradient } = gradientValues[id]

  const newGradient = Object.keys(gradient).reduce((aggr, curr, index) => {
    aggr[curr] = {
      ...gradient[curr],
      color: colors[index]
    }
    return aggr
  }, {})

  dispatch({
    type: UPDATE_COLOR_STOP,
    payload: {
      id,
      newGradient
    }
  })
}
