import {
  EDIT_STOP,
  EDIT_STOP_COLOR,
  SWAP_STOP_COLORS,
  UPDATE_DRAGGED_STOP_POS,
  UPDATE_UPDATING_STOP,
  TOGGLE_ACTIVE_COLOR_PICKER,
  UPDATE_STOP_COLOR,
  UPDATE_ACTIVE_STOP,
  DELETE_ACTIVE_STOP,
  ADD_COLOR_STOP
} from './actions'

const INITIAL_STATE = {
  values: {
    '2a': {
      '0': '#e0c3fc',
      '50': '#8ec5fc',
      '90': '#43e97b'
    },
    '1a': {
      '0': '#fad0c4',
      '100': '#d1ffe7'
    }
  },
  editing: null,
  editingColor: null,
  updating: {
    origUnchanged: {},
    stop: null,
    passThreshold: false,
    pickingColorStop: null,
    active: null
  },
  updatingStopXPos: null
}
// '4a': {
//     '9': '#ffffff',
//     '70': '#c3cfe2',
//     '100': '#fad0c4'
//   },
// '3a': {
//   0: '#8ec5fc',
//   70: '#c3cfe2',
//   100: '#43e97b'
// },
// '5a': {
//   0: '#00253C',
//   25: '#086B3C',
//   50: '#8ec5fc',
//   100: '#000000'
// }
export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case EDIT_STOP:
      return {
        ...state,
        editing: action.payload.id,
        updating: {
          ...state.updating,
          origUnchanged: state.values[action.payload.id]
        }
      }

    case EDIT_STOP_COLOR:
      return {
        ...state,
        editingColor: action.payload.id
      }

    case SWAP_STOP_COLORS:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.id]: action.payload.updatedStop
        }
      }

    case UPDATE_DRAGGED_STOP_POS:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.editing]: action.payload.updatedStopValues
        },
        updating: {
          ...state.updating,
          origUnchanged: action.payload.updatedStopValues,
          stop: action.payload.updatedStop,
          passThreshold: action.payload.passThreshold
            ? action.payload.passThreshold
            : state.updating.passThreshold,
          pickingColorStop: null,
          active: action.payload.updatedStop
        }
      }

    case UPDATE_UPDATING_STOP:
      return {
        ...state,
        updating: {
          ...state.updating,
          stop: action.payload.stop,
          passThreshold: action.payload.stop === null &&
            state.updatingStopXPos !== action.payload.xPos
        },
        updatingStopXPos: action.payload.xPos
      }

    case TOGGLE_ACTIVE_COLOR_PICKER:
      return {
        ...state,
        updating: {
          ...state.updating,
          pickingColorStop: action.payload.stop
        }
      }

    case UPDATE_STOP_COLOR:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.id]: {
            ...state.values[action.payload.id],
            [action.payload.stop]: action.payload.color
          }
        },
        updating: {
          ...state.updating,
          origUnchanged: {
            ...state.updating.origUnchanged,
            [action.payload.stop]: action.payload.color
          }
        }
      }

    case UPDATE_ACTIVE_STOP:
      return {
        ...state,
        updating: {
          ...state.updating,
          active: action.payload.stop
        }
      }

    case DELETE_ACTIVE_STOP:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.editing]: action.payload.newValues
        },
        updating: {
          origUnchanged: action.payload.newValues,
          stop: null,
          passThreshold: false,
          pickingColorStop: null,
          active: null
        }
      }

    case ADD_COLOR_STOP:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.editing]: action.payload.newValues
        }
      }

    default:
      return state
  }
}
