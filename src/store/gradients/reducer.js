import {
  UPDATE_ANGLE,
  UPDATE_ACTIVE_ID,
  TOGGLE_EDITING,
  UPDATE_EDITING_ANGLE,
  UPDATE_EXPANDED,
  RENDER_MORE_GRADIENTS
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
    },
    '4a': {
      id: '4a',
      angle: 180
    },
    '3a': {
      id: '3a',
      angle: 0
    },
    '5a': {
      id: '5a',
      angle: 220
    },
    '6a': {
      id: '6a',
      angle: 220
    },
    '7a': {
      id: '7a',
      angle: 220
    },
    '8a': {
      id: '8a',
      angle: 180
    },
    '9a': {
      id: '9a',
      angle: 0
    },
    '10a': {
      id: '10a',
      angle: 220
    },
    '11a': {
      id: '11a',
      angle: 220
    },
    '12a': {
      id: '12a',
      angle: 220
    },
    '13': {
      id: '13',
      angle: 60
    },
    '14': {
      id: '14',
      angle: 10
    },
    '15': {
      id: '15',
      angle: 180
    },
    '16': {
      id: '16',
      angle: 0
    },
    '17': {
      id: '17',
      angle: 220
    },
    '18': {
      id: '18',
      angle: 220
    },
    '19': {
      id: '19',
      angle: 220
    },
    '20': {
      id: '20',
      angle: 180
    },
    '21': {
      id: '21',
      angle: 0
    },
    '22': {
      id: '22',
      angle: 220
    },
    '23': {
      id: '23',
      angle: 220
    },
    '24': {
      id: '24',
      angle: 220
    }
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
