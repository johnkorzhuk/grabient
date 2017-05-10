import { TOGGLE_SORTING } from './actions'

const INITIAL_STATE = {
  sorting: false
}

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case TOGGLE_SORTING:
      return {
        ...state,
        sorting: !state.sorting
      }

    default:
      return state
  }
}
