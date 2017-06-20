import deepEqual from 'deep-equal'

import { INITIAL_STATE as initGradients } from './reducer'
import { INITIAL_STATE as initStops } from './../stops/reducer'
import { getGradientData } from './selectors'

export const UPDATE_ANGLE = 'gradients/UPDATE_ANGLE'
export const UPDATE_ACTIVE_ID = 'gradients/UPDATE_ACTIVE_ID'
export const UPDATE_EDITED_STATE = 'gradients/UPDATE_EDITED_STATE'
export const TOGGLE_EDITING_ANGLE = 'gradients/TOGGLE_EDITING_ANGLE'
export const UPDATE_EDITING_ANGLE = 'gradients/UPDATE_EDITING_ANGLE'
export const UPDATE_EXPANDED = 'gradients/UPDATE_EXPANDED'
export const RENDER_MORE_GRADIENTS = 'gradients/RENDER_MORE_GRADIENTS'

const checkIfNaN = num => {
  if (typeof num !== 'number') num = parseInt(num, 10)
  return isNaN(num) ? 0 : num
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

export const updateGradientAngle = (id, angle) => (dispatch, getState) => {
  const { gradients, stops } = getState()
  const orig = getGradientData(id, initGradients, initStops)
  let newdata = getGradientData(id, gradients, stops)
  newdata.angle = angle

  dispatch({
    type: UPDATE_EDITED_STATE,
    payload: {
      edited: !deepEqual(orig, newdata),
      id
    }
  })

  return dispatch({
    type: UPDATE_ANGLE,
    payload: {
      id,
      angle: checkIfNaN(angle)
    }
  })
}

export const toggleEditing = id => dispatch => {
  return dispatch({
    type: TOGGLE_EDITING_ANGLE,
    payload: {
      id
    }
  })
}

export const updateEditingAngle = angle => dispatch => {
  return dispatch({
    type: UPDATE_EDITING_ANGLE,
    payload: {
      angle
    }
  })
}

export const updateExpanded = id => dispatch => {
  return dispatch({
    type: UPDATE_EXPANDED,
    payload: {
      id
    }
  })
}

export const renderMoreGradients = amount => dispatch => {
  return dispatch({
    type: RENDER_MORE_GRADIENTS,
    payload: {
      amount
    }
  })
}
