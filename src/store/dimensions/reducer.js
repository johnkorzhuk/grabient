import { UPDATE_SWATCH_DIMENSIONS } from './actions'

const INITIAL_STATE = {
  swatch: {
    width: null,
    left: null
  }
}

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case UPDATE_SWATCH_DIMENSIONS:
      return {
        ...state,
        swatch: action.payload.dimensions
      }

    default:
      return state
  }
}
