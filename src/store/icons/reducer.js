import { TOGGLE_TRASH_ICON, TOGGLE_CSS_COPIED } from './actions'

const INITAL_STATE = {
  deleteStop: {
    render: false
  },
  copied: null
}

export default (state = INITAL_STATE, action) => {
  switch (action.type) {
    case TOGGLE_TRASH_ICON:
      return {
        ...state,
        deleteStop: {
          render: !state.deleteStop.render
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
