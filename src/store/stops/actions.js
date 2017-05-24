export const SWAP_STOP_COLORS = 'stops/UPDATE_STOPS_COLORS'
export const EDIT_STOP = 'stops/EDIT_STOP'
export const UPDATE_DRAGGED_ITEM_POS = 'stops/UPDATE_DRAGGED_ITEM_POS'
export const UPDATE_STOP_POS = 'stops/UPDATE_STOP_POS'

export const updateStopPos = (origStop, newStop, stopsMap, id) => dispatch => {
  const rounded = Math.round(newStop)
  const newValues = Object.keys(stopsMap).reduce((aggr, curr) => {
    let current = parseInt(curr, 10)

    if (current === rounded) {
      let adjusted = current
      if (current + 1 > 100) adjusted -= 1
      else adjusted += 1
      aggr[adjusted] = stopsMap[current]
    } else if (current === origStop) {
      aggr[rounded] = stopsMap[origStop]
    } else {
      aggr[curr] = stopsMap[curr]
    }

    return aggr
  }, {})

  return dispatch({
    type: UPDATE_STOP_POS,
    payload: {
      id,
      newValues
    }
  })
}

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

export const updateDraggedItemXPos = xPos => dispatch => {
  // console.log(xPos)
  return dispatch({
    type: UPDATE_DRAGGED_ITEM_POS,
    payload: {
      xPos
    }
  })
}
