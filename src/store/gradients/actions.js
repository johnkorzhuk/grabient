export const UPDATE_ANGLE = 'gradients/UPDATE_ANGLE'
export const UPDATE_ACTIVE_ID = 'gradients/UPDATE_ACTIVE_ID'
export const TOGGLE_EDITING = 'gradients/TOGGLE_EDITING'
export const UPDATE_EDITING_ANGLE = 'gradients/UPDATE_EDITING_ANGLE'
export const UPDATE_EXPANDED = 'gradients/UPDATE_EXPANDED'

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

export const updateGradientAngle = (id, angle) => dispatch => {
  return dispatch({
    type: UPDATE_ANGLE,
    payload: {
      id,
      angle
    }
  })
}

export const toggleEditing = id => dispatch => {
  return dispatch({
    type: TOGGLE_EDITING,
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
