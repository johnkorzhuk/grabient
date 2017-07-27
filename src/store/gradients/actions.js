import deepEqual from 'deep-equal';

import { INITIAL_STATE as initGradients } from './reducer';
import { INITIAL_STATE as initStops } from './../stops/reducer';
import { getGradientData } from './selectors';

import { TOGGLE_CSS_COPIED } from './../icons/actions';

export const UPDATE_ANGLE = 'gradients/UPDATE_ANGLE';
export const UPDATE_ACTIVE_ID = 'gradients/UPDATE_ACTIVE_ID';
export const UPDATE_EDITED_STATE = 'gradients/UPDATE_EDITED_STATE';
export const TOGGLE_EDITING_ANGLE = 'gradients/TOGGLE_EDITING_ANGLE';
export const UPDATE_EDITING_ANGLE = 'gradients/UPDATE_EDITING_ANGLE';
export const UPDATE_EXPANDED = 'gradients/UPDATE_EXPANDED';
export const RESET_GRADIENT_ANGLE = 'gradients/RESET_GRADIENT_ANGLE';
export const UPDATE_PAGE = 'gradients/UPDATE_PAGE';

const checkIfNaN = num => {
  let number = num;
  if (typeof number !== 'number') number = parseInt(num, 10);
  return Number.isNaN(num) ? 0 : num;
};

export const updateActiveId = () => (dispatch, getState) => {
  const { gradients: { active, gradientValues } } = getState();
  const gradientKeys = Object.keys(gradientValues);
  const next = gradientKeys.indexOf((active + 1).toString()) < 0 ? 0 : active;
  const { id } = gradientValues[gradientKeys[next]];

  return dispatch({
    type: UPDATE_ACTIVE_ID,
    payload: {
      id
    }
  });
};

export const updateGradientAngle = (id, angle) => (dispatch, getState) => {
  const { gradients, stops } = getState();
  const orig = getGradientData(id, initGradients, initStops);
  const newdata = getGradientData(id, gradients, stops);
  newdata.angle = angle;

  dispatch({
    type: UPDATE_EDITED_STATE,
    payload: {
      edited: !deepEqual(orig, newdata),
      id
    }
  });

  return dispatch({
    type: UPDATE_ANGLE,
    payload: {
      id,
      angle: checkIfNaN(angle)
    }
  });
};

export const toggleEditing = id => dispatch =>
  dispatch({
    type: TOGGLE_EDITING_ANGLE,
    payload: {
      id
    }
  });

export const updateEditingAngle = angle => dispatch =>
  dispatch({
    type: UPDATE_EDITING_ANGLE,
    payload: {
      angle
    }
  });

export const updateExpanded = id => dispatch =>
  dispatch({
    type: UPDATE_EXPANDED,
    payload: {
      id
    }
  });

export const resetGradientAngle = id => dispatch => {
  dispatch({
    type: TOGGLE_CSS_COPIED,
    payload: {
      id: null
    }
  });

  return dispatch({
    type: RESET_GRADIENT_ANGLE,
    payload: {
      id
    }
  });
};

export const updatePage = page => dispatch =>
  dispatch({
    type: UPDATE_PAGE,
    payload: {
      page
    }
  });
