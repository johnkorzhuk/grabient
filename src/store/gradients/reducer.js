import {
  UPDATE_ANGLE,
  UPDATE_ACTIVE_ID,
  TOGGLE_EDITING_ANGLE,
  UPDATE_EDITING_ANGLE,
  UPDATE_EXPANDED,
  RENDER_MORE_GRADIENTS,
  UPDATE_EDITED_STATE,
  RESET_GRADIENT_ANGLE
} from './actions'

export const INITIAL_STATE = {
  gradientValues: {
    '2a': {
      id: '2a',
      angle: 60,
      edited: false
    }
    // '1a': {
    //   id: '1a',
    //   angle: 10,
    //   edited: false
    // },
    // '4a': {
    //   id: '4a',
    //   angle: 180,
    //   edited: false
    // }
    // '3a': {
    //   id: '3a',
    //   angle: 0,
    //   edited: false
    // },
    // '5a': {
    //   id: '5a',
    //   angle: 220,
    //   edited: false
    // },
    // '6a': {
    //   id: '6a',
    //   angle: 220,
    //   edited: false
    // },
    // '7a': {
    //   id: '7a',
    //   angle: 220,
    //   edited: false
    // },
    // '8a': {
    //   id: '8a',
    //   angle: 180,
    //   edited: false
    // },
    // '9a': {
    //   id: '9a',
    //   angle: 0,
    //   edited: false
    // },
    // '10a': {
    //   id: '10a',
    //   angle: 220,
    //   edited: false
    // },
    // '11a': {
    //   id: '11a',
    //   angle: 220,
    //   edited: false
    // },
    // '12a': {
    //   id: '12a',
    //   angle: 220,
    //   edited: false
    // },
    // '13': {
    //   id: '13',
    //   angle: 60,
    //   edited: false
    // },
    // '14': {
    //   id: '14',
    //   angle: 10,
    //   edited: false
    // },
    // '15': {
    //   id: '15',
    //   angle: 180,
    //   edited: false
    // },
    // '16': {
    //   id: '16',
    //   angle: 0,
    //   edited: false
    // },
    // '17': {
    //   id: '17',
    //   angle: 220,
    //   edited: false
    // },
    // '18': {
    //   id: '18',
    //   angle: 220,
    //   edited: false
    // },
    // '19': {
    //   id: '19',
    //   angle: 220,
    //   edited: false
    // },
    // '20': {
    //   id: '20',
    //   angle: 180,
    //   edited: false
    // },
    // '21': {
    //   id: '21',
    //   angle: 0,
    //   edited: false
    // },
    // '22': {
    //   id: '22',
    //   angle: 220,
    //   edited: false
    // },
    // '23': {
    //   id: '23',
    //   angle: 220,
    //   edited: false
    // },
    // '24': {
    //   id: '24',
    //   angle: 220,
    //   edited: false
    // }
  },
  expanded: null,
  editingAngle: {
    id: null,
    angle: null
  },
  // 'hex', 'rgb', 'hsl'
  colors: 'hex',
  gradientsToRender: 9
}

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case UPDATE_ACTIVE_ID:
      return {
        ...state,
        active: action.payload.id
      }

    case UPDATE_EDITED_STATE:
      return {
        ...state,
        gradientValues: {
          ...state.gradientValues,
          [action.payload.id]: {
            ...state.gradientValues[action.payload.id],
            edited: action.payload.edited
          }
        }
      }

    case RESET_GRADIENT_ANGLE:
      return {
        ...state,
        gradientValues: {
          ...state.gradientValues,
          [action.payload.id]: INITIAL_STATE.gradientValues[action.payload.id]
        }
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

    case TOGGLE_EDITING_ANGLE:
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

    case UPDATE_EXPANDED:
      return {
        ...state,
        expanded: action.payload.id
      }

    case RENDER_MORE_GRADIENTS:
      return {
        ...state,
        gradientsToRender: (state.gradientsToRender += action.payload.amount)
      }

    default:
      return state
  }
}
