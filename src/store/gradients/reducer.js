import {
  UPDATE_ANGLE,
  UPDATE_ACTIVE_ID,
  TOGGLE_EDITING,
  UPDATE_EDITING_ANGLE
} from './actions'

const INITIAL_STATE = {
  gradientValues: {
    '2a': {
      id: '2a',
      angle: 60
    },
    '1a': {
      id: '1a',
      angle: 10
    }
  },
  // active: 1,
  editingAngle: {
    id: null,
    angle: null
  }
}
//  '4a': {
// id: '4a',
// angle: 180
// },
// '3a': {
//   id: '3a',
//   angle: 0
// },
// '5a': {
//   id: '5a',
//   angle: 220
// }

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case UPDATE_ACTIVE_ID:
      return {
        ...state,
        active: action.payload.id
      }

    case UPDATE_ANGLE:
      return {
        ...state,
        gradientValues: {
          ...state.gradientValues,
          [action.payload.id]: {
            ...state.gradientValues[action.payload.id],
            angle: action.payload.angle
          }
        }
      }

    case TOGGLE_EDITING:
      return {
        ...state,
        editingAngle: {
          ...state.editingAngle,
          id: state.editingAngle.id === action.payload.id ||
            action.payload.id === null
            ? null
            : action.payload.id,
          angle: null
        }
      }

    case UPDATE_EDITING_ANGLE:
      return {
        ...state,
        editingAngle: {
          ...state.editingAngle,
          angle: action.payload.angle
        }
      }

    default:
      return state
  }
}
