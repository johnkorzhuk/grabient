import { EDIT_STOP, UPDATE_STOP } from './actions'

const INITIAL_STATE = {
  values: {
    '2a': {
      0: '#e0c3fc',
      50: '#8ec5fc',
      100: '#43e97b'
    },
    '1a': {
      0: '#fad0c4',
      100: '#ffd1ff'
    },
    '4a': {
      9: '#ffffff',
      70: '#c3cfe2',
      100: '#fad0c4'
    },
    '3a': {
      0: '#8ec5fc',
      70: '#c3cfe2',
      100: '#43e97b'
    },
    '5a': {
      0: '#00253C',
      25: '#086B3C',
      50: '#8ec5fc',
      100: '#000000'
    }
  },
  editing: '2a'
}

export default (state = INITIAL_STATE, action) => {
  switch (action.type) {
    case EDIT_STOP:
      return {
        ...state,
        editing: action.payload.id
      }
    default:
      return state
  }
}
