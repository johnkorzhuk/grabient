export const UPDATE_SWATCH_DIMENSIONS = 'dimensions/UPDATE_SWATCH_DIMENSIONS'

export const updateSwatchDimensions = (clientRects, reset) => dispatch => {
  if (reset) {
    return dispatch({
      type: UPDATE_SWATCH_DIMENSIONS,
      payload: {
        dimensions: {
          width: null,
          left: null
        }
      }
    })
  } else {
    const { width, left } = clientRects[0]
    return dispatch({
      type: UPDATE_SWATCH_DIMENSIONS,
      payload: {
        dimensions: {
          width,
          left
        }
      }
    })
  }
}
