import { shiftConflictedStops, shiftStops } from './utils'
import { INVERT_TRASH_ICON, TOGGLE_TRASH_ICON } from './../icons/actions'

const UPDATING_STOP_THRESHOLD = 5
// actions
export const UPDATE_UPDATING_STOP = 'stops/UPDATE_UPDATING_STOP'
export const EDIT_STOP = 'stops/EDIT_STOP'
export const EDIT_STOP_COLOR = 'stops/EDIT_STOP_COLOR'
export const SWAP_STOP_COLORS = 'stops/UPDATE_STOPS_COLORS'
export const UPDATE_DRAGGED_STOP_POS = 'stops/UPDATE_DRAGGED_STOP_POS'
export const TOGGLE_ACTIVE_COLOR_PICKER = 'stops/TOGGLE_ACTIVE_COLOR_PICKER'
export const UPDATE_STOP_COLOR = 'stops/UPDATE_STOP_COLOR'
export const UPDATE_ACTIVE_STOP = 'stops/UPDATE_ACTIVE_STOP'
export const DELETE_ACTIVE_STOP = 'stops/DELETE_ACTIVE_STOP'
export const ADD_COLOR_STOP = 'stops/ADD_COLOR_STOP'

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

export const editStopColor = id => dispatch => {
  return dispatch({
    type: EDIT_STOP_COLOR,
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
    dimensions: { swatch: { left, width } },
    icons: { deleteStop: { render, inverted } }
  } = getState()

  if (stop !== null) {
    let updatedStopValues = { ...origUnchanged }
    let updatedStop = Math.round((xPos - left) / width * 100)
    if (updatedStop <= -10 && render && !inverted) {
      dispatch({
        type: INVERT_TRASH_ICON
      })
    } else if (updatedStop > -10 && inverted) {
      dispatch({
        type: INVERT_TRASH_ICON
      })
    }
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
      if (!render) {
        dispatch({
          type: TOGGLE_TRASH_ICON
        })
      }

      return dispatch({
        type: UPDATE_DRAGGED_STOP_POS,
        payload: {
          editing,
          updatedStopValues,
          updatedStop: updatedStop.toString(),
          passThreshold: true
        }
      })
    } else if (passThreshold) {
      return dispatch({
        type: UPDATE_DRAGGED_STOP_POS,
        payload: {
          editing,
          updatedStopValues,
          updatedStop: updatedStop.toString()
        }
      })
    }
  }
}

export const updateActiveColorPicker = (stop, currActive) => dispatch => {
  if (stop === currActive || stop === null) {
    console.log('yo')
    return dispatch({
      type: TOGGLE_ACTIVE_COLOR_PICKER,
      payload: {
        stop: null
      }
    })
  } else {
    return dispatch({
      type: TOGGLE_ACTIVE_COLOR_PICKER,
      payload: {
        stop
      }
    })
  }
}

export const updateStopColor = (stop, color, id) => dispatch => {
  return dispatch({
    type: UPDATE_STOP_COLOR,
    payload: {
      stop,
      color,
      id
    }
  })
}

export const updateActiveStop = stop => dispatch => {
  return dispatch({
    type: UPDATE_ACTIVE_STOP,
    payload: {
      stop
    }
  })
}

export const deleteActiveStop = () => (dispatch, getState) => {
  const { stops: { values, updating, editing } } = getState()

  const newValues = { ...values[editing] }
  if (Object.keys(newValues).length > 2) {
    delete newValues[updating.active]

    dispatch({
      type: DELETE_ACTIVE_STOP,
      payload: {
        editing,
        newValues
      }
    })

    return dispatch({
      type: TOGGLE_TRASH_ICON
    })
  }
}

export const addColorStop = id => (dispatch, getState) => {
  const { stops: { values, editing } } = getState()
  const newValues = shiftStops(values[editing])

  if (Object.keys(newValues).length < 7) {
    return dispatch({
      type: ADD_COLOR_STOP,
      payload: {
        editing,
        newValues
      }
    })
  }
}
