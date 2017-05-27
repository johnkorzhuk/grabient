import {
  EDIT_STOP,
  SWAP_STOP_COLORS,
  UPDATE_DRAGGED_ITEM_POS,
  UPDATE_UPDATING_STOP
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
      '100': '#ffd1ff'
    },
    '4a': {
      '9': '#ffffff',
      '70': '#c3cfe2',
      '100': '#fad0c4'
    }
  },
  editing: null,
  updating: {
    origUnchanged: {},
    stop: null
  }
}

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

    case SWAP_STOP_COLORS:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.id]: action.payload.updatedStop
        }
      }
    // case UPDATE_DRAGGED_ITEM_POS:
    //   return {
    //     ...state,
    //     draggingItemMousePos: action.payload.xPos
    //   }
    case UPDATE_DRAGGED_ITEM_POS:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.editing]: action.payload.updatedStopValues
        },
        updating: {
          ...state.updating,
          origUnchanged: action.payload.updatedStopValues,
          stop: action.payload.updatedStop
        }
      }

    case UPDATE_UPDATING_STOP:
      return {
        ...state,
        updating: {
          ...state.updating,
          stop: action.payload.stop
        }
      }
    // case UPDATE_STOP_POS:
    //   return {
    //     ...state,
    //     values: {
    //       ...state.values,
    //       [action.payload.id]: action.payload.newValues
    //     }
    //   }

    default:
      return state
  }
}
