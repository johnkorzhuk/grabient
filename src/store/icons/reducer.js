import {
  TOGGLE_TRASH_ICON,
  INVERT_TRASH_ICON,
  TOGGLE_CSS_COPIED
} from './actions'

const INITAL_STATE = {
  deleteStop: {
    render: false,
    inverted: false
  },
  copied: null
}

export default (state = INITAL_STATE, action) => {
  switch (action.type) {
    case TOGGLE_TRASH_ICON:
      return {
        ...state,
        deleteStop: {
          ...state.deleteStop,
          render: !state.deleteStop.render,
          inverted: false
        }
      }

    case INVERT_TRASH_ICON:
      return {
        ...state,
        deleteStop: {
          ...state.deleteStop,
          inverted: !state.deleteStop.inverted
        }
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
