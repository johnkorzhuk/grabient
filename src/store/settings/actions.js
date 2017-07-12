import { saveState } from './../../utils/localStorage';

export const TOGGLE_PREFIXES = 'settings/TOGGLE_PREFIXES';
export const TOGGLE_FALLBACK = 'settings/TOGGLE_FALLBACK';

export const togglePrefixes = () => (dispatch, getState) => {
  const { settings } = getState();
  const prefixes = !settings.prefixes;

  dispatch({
    type: TOGGLE_PREFIXES,
    payload: {
      prefixes
    }
  });

  return saveState({
    ...settings,
    prefixes
  });
};

export const toggleFallback = () => (dispatch, getState) => {
  const { settings } = getState();
  const fallback = !settings.fallback;

  dispatch({
    type: TOGGLE_FALLBACK,
    payload: {
      fallback
    }
  });

  return saveState({
    ...settings,
    fallback
  });
};
