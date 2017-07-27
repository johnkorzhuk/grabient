import { generateLinearGradient } from './../../utils/gradient';
import { copyTextToClipboard } from './utils';

export const TOGGLE_TRASH_ICON = 'icons/TOGGLE_TRASH_ICON';
export const TOGGLE_CSS_COPIED = 'icons/TOGGLE_CSS_COPIED';

export const toggleTrashIcon = id => dispatch =>
  dispatch({
    type: TOGGLE_TRASH_ICON,
    payload: {
      id
    }
  });

export const copyCSS = (angle, stopData, id) => (dispatch, getState) => {
  const { settings: { prefixes, fallback } } = getState();
  const css = generateLinearGradient(angle, stopData, prefixes, fallback);
  copyTextToClipboard(css);
  dispatch({
    type: TOGGLE_CSS_COPIED,
    payload: {
      id
    }
  });

  setTimeout(
    () =>
      dispatch({
        type: TOGGLE_CSS_COPIED,
        payload: {
          id: null
        }
      }),
    2000
  );
};
