import { TOGGLE_TRASH_ICON, TOGGLE_CSS_COPIED } from './actions'

const INITAL_STATE = {
  deleteStop: null,
  copied: null
}

export default (state = INITAL_STATE, action) => {
  switch (action.type) {
    case TOGGLE_TRASH_ICON:
      // console.log(action.payload.id)
      return {
        ...state,
        deleteStop: action.payload.id
      }

    case TOGGLE_CSS_COPIED:
      return {
        ...state,
        copied: action.payload.id
      }

    default:
      return state
  }
}
