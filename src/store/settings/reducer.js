import { TOGGLE_PREFIXES, TOGGLE_FALLBACK } from './actions';

const INITIAL_STATE = {
  prefixes: false,
  fallback: true
};

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case TOGGLE_PREFIXES:
      return {
        ...state,
        prefixes: action.payload.prefixes
      };

    case TOGGLE_FALLBACK:
      return {
        ...state,
        fallback: action.payload.fallback
      };

    default:
      return state;
  }
};
