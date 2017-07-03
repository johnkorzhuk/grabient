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
        prefixes: !state.prefixes
      };

    case TOGGLE_FALLBACK:
      return {
        ...state,
        fallback: !state.fallback
      };

    default:
      return state;
  }
};
