export const UPDATE_STOP = 'stops/UPDATE_STOP'
export const EDIT_STOP = 'stops/EDIT_STOP'

export const updateStop = id => dispatch => {}

export const editStop = id => dispatch => {
  dispatch({
    type: EDIT_STOP,
    payload: {
      id
    }
  })
}
