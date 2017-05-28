import { shiftConflictedStops } from './utils'

export const SWAP_STOP_COLORS = 'stops/UPDATE_STOPS_COLORS'
export const EDIT_STOP = 'stops/EDIT_STOP'
export const UPDATE_DRAGGED_ITEM_POS = 'stops/UPDATE_DRAGGED_ITEM_POS'
export const UPDATE_UPDATING_STOP = 'stops/UPDATE_UPDATING_STOP'
export const UPDATING_STOP_THRESHOLD = 5

export const updateUpdatingStop = (stop, xPos) => dispatch => {
  return dispatch({
    type: UPDATE_UPDATING_STOP,
    payload: {
      stop,
      xPos
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

export const updateDraggedStopPos = xPos => (dispatch, getState) => {
  const {
    stops: {
      updating: { stop, origUnchanged, passThreshold },
      editing,
      updatingStopXPos
    },
    dimensions: { swatch: { left, width } }
  } = getState()

  if (stop !== null) {
    let updatedStopValues = { ...origUnchanged }
    let updatedStop = Math.round((xPos - left) / width * 100)
    if (updatedStop < 0) updatedStop = 0
    else if (updatedStop > 100) updatedStop = 100

    delete updatedStopValues[stop]
    if (updatedStopValues[updatedStop] !== undefined) {
      updatedStopValues = shiftConflictedStops(
        updatedStopValues,
        updatedStop,
        stop > updatedStop
      )
    }
    updatedStopValues[updatedStop] = origUnchanged[stop]

    if (Math.abs(updatingStopXPos - xPos) >= UPDATING_STOP_THRESHOLD) {
      return dispatch({
        type: UPDATE_DRAGGED_ITEM_POS,
        payload: {
          editing,
          updatedStopValues,
          updatedStop,
          passThreshold: true
        }
      })
    } else if (passThreshold) {
      return dispatch({
        type: UPDATE_DRAGGED_ITEM_POS,
        payload: {
          editing,
          updatedStopValues,
          updatedStop
        }
      })
    }
  }
}
