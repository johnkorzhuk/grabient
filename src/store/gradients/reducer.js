import { UPDATE_ANGLE, UPDATE_COLOR_STOP } from './actions'

const INITIAL_STATE = {
  gradientValues: {
    1: {
      id: 1,
      angle: 180,
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
    2: {
      id: 2,
      angle: 110,
      gradient: {
        stop1: {
          color: '#e0c3fc',
          stop: 0
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
    3: {
      id: 3,
      angle: 180,
      gradient: {
        stop1: {
          color: '#fad0c4',
          stop: 0
        },
        stop2: {
          color: '#fee140',
          stop: 25
        },
        stop3: {
          color: '#8ec5fc',
          stop: 50
        },
        stop4: {
          color: '#43e97b',
          stop: 100
        }
      }
    },
    4: {
      id: 4,
      angle: 180,
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
    }
  },
  active: null
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

    case UPDATE_ANGLE:
      return

    default:
      return state
  }
}
