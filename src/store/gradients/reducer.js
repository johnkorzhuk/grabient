import {
  UPDATE_ANGLE,
  UPDATE_COLOR_STOP,
  UPDATE_ACTIVE_ID,
  TOGGLE_EDITING,
  UPDATE_EDITING_ANGLE
} from './actions'

const INITIAL_STATE = {
  gradientValues: {
    1: {
      id: 2,
      angle: 60,
      gradient: {
        stop1: {
          color: '#e0c3fc',
          stop: -20
        },
        stop2: {
          color: '#8ec5fc',
          stop: 50
        },
        stop3: {
          color: '#43e97b',
          stop: 100
        }
      }
    },
    2: {
      id: 1,
      angle: 0,
      gradient: {
        stop1: {
          color: '#fad0c4',
          stop: 0
        },
        stop2: {
          color: '#ffd1ff',
          stop: 100
        }
      }
    },

    4: {
      id: 4,
      angle: 270,
      gradient: {
        stop1: {
          color: '#f5f7fa',
          stop: 0
        },
        stop2: {
          color: '#c3cfe2',
          stop: 70
        },
        stop3: {
          color: '#fad0c4',
          stop: 100
        }
      }
    },
    3: {
      id: 3,
      angle: 270,
      gradient: {
        stop1: {
          color: '#8ec5fc',
          stop: 0
        },
        stop2: {
          color: '#c3cfe2',
          stop: 70
        },
        stop3: {
          color: '#43e97b',
          stop: 100
        }
      }
    },
    5: {
      id: 5,
      angle: 220,
      gradient: {
        stop1: {
          color: '#00253C',
          stop: 0
        },
        stop2: {
          color: '#086B3C',
          stop: 25
        },
        stop3: {
          color: '#8ec5fc',
          stop: 50
        },
        stop4: {
          color: '#000000',
          stop: 100
        }
      }
    }
  },
  active: 1,
  editingAngle: {
    id: null,
    angle: null
  }
}

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case UPDATE_COLOR_STOP:
      return {
        ...state,
        gradientValues: {
          ...state.gradientValues,
          [action.payload.id]: {
            ...state.gradientValues[action.payload.id],
            gradient: {
              ...[action.payload.id].gradient,
              ...action.payload.newGradient
            }
          }
        }
      }

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
