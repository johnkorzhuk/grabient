export const UPDATE_STOP = 'stops/UPDATE_STOP'
export const SWAP_STOP_COLORS = 'stops/UPDATE_STOPS_COLORS'
export const EDIT_STOP = 'stops/EDIT_STOP'

export const updateStop = id => dispatch => {}

export const editStop = id => dispatch => {
  return dispatch({
    type: EDIT_STOP,
    payload: {
      id
    }
  })
}

export const swapStopsColors = (id, colors) => (dispatch, getState) => {
  const { values } = getState().stops
  const updatedStop = Object.keys(values[id]).reduce((aggr, curr, index) => {
    aggr[curr] = colors[index]
    return aggr
  }, {})

  return dispatch({
    type: SWAP_STOP_COLORS,
    payload: {
      id,
      updatedStop
    }
  })
}
