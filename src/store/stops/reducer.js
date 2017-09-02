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
  ADD_COLOR_STOP,
  RESET_COLOR_STOP
} from './actions';

export const INITIAL_STATE = {
  values: {
    '27e6a30f-f404-4c8f-8936-c34303883f24': {
      '0': '#FFFFFF',
      '50': '#6284FF',
      '100': '#FF0000'
    },
    '75618255-3439-4e4e-9686-d57a1a4aec7b': {
      '25': '#52ACFF',
      '100': '#FFE32C'
    },
    '84ed77f3-b1c8-42be-af91-f177728b063a': {
      '0': '#FFE53B',
      '74': '#FF2525'
    },
    'b4da6cdd-c43e-4796-bd35-960d07d0e956': {
      '0': '#FAACA8',
      '100': '#DDD6F3'
    },
    '8a6b7dd4-b7d5-4a89-a472-baf98932154d': {
      '0': '#21D4FD',
      '100': '#B721FF'
    },
    '72dc83ee-28ac-4e81-acec-545b7f92bd7b': {
      '0': '#08AEEA',
      '100': '#2AF598'
    },
    'cf5948b4-eb69-43ab-af89-d6b2b5789551': {
      '0': '#FEE140',
      '100': '#FA709A'
    },
    '144be87e-63ca-448f-8cc5-94d2a59a1c22': {
      '0': '#8EC5FC',
      '100': '#E0C3FC'
    },
    '50e52b42-b967-4370-b073-630a1d5be027': {
      '0': '#FBAB7E',
      '100': '#F7CE68'
    },
    'f4612216-e93a-424a-99c6-e10d4939f238': {
      '0': '#FF3CAC',
      '50': '#784BA0',
      '100': '#2B86C5'
    },
    '1faf4399-7c49-40ca-8c31-7558c358436d': {
      '0': '#D9AFD9',
      '100': '#97D9E1'
    },
    '433c9b4d-d9cb-42aa-b24b-959284f64d4c': {
      '0': '#00DBDE',
      '100': '#FC00FF'
    },
    'a09019e6-8a63-4dcc-bfc3-c10324523f15': {
      '0': '#F4D03F',
      '100': '#16A085'
    },
    '071f4579-381e-45fd-8f58-89d9a64234a4': {
      '0': '#0093E9',
      '100': '#80D0C7'
    },
    'b3e87cb9-036b-43ec-a89c-7d1272ce1a23': {
      '0': '#74EBD5',
      '100': '#9FACE6'
    },
    'b6338b88-5ae9-4484-b57c-29b97bb4df00': {
      '0': '#FAD961',
      '100': '#F76B1C'
    },
    '8de97c99-10e8-4200-9bca-f01ad3dac544': {
      '0': '#FA8BFF',
      '52': '#2BD2FF',
      '90': '#2BFF88'
    },
    '9fa2b461-0847-47fc-86fd-ae81b352d383': {
      '0': '#FBDA61',
      '100': '#FF5ACD'
    },
    '6c26cc7c-35d4-4316-ae1c-af247c637be6': {
      '0': '#8BC6EC',
      '100': '#9599E2'
    },
    'a17d5049-3a60-4040-8751-563fd0d4eff5': {
      '0': '#A9C9FF',
      '100': '#FFBBEC'
    },
    '8aecc400-30f6-42b1-b277-cfbb479293c3': {
      '0': '#3EECAC',
      '100': '#EE74E1'
    },
    '057d18a3-1f75-4ca8-bff7-71d211b1bf55': {
      '0': '#4158D0',
      '46': '#C850C0',
      '100': '#FFCC70'
    },
    '649c7b5e-b2d5-4e93-ad67-51d9be2321f3': {
      '0': '#85FFBD',
      '100': '#FFFB7D'
    },
    '70bc9b1d-352e-48fc-af29-1f5cad8a8103': {
      '0': '#FFDEE9',
      '100': '#B5FFFC'
    },
    '9e54c561-a249-4275-81d2-e5ce6458a9b6': {
      '0': '#FF9A8B',
      '55': '#FF6A88',
      '100': '#FF99AC'
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
};

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
      };

    case EDIT_STOP_COLOR:
      return {
        ...state,
        editingColor: action.payload.id
      };

    case SWAP_STOP_COLORS:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.id]: action.payload.updatedStop
        }
      };

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
      };

    case UPDATE_UPDATING_STOP:
      return {
        ...state,
        updating: {
          ...state.updating,
          stop: action.payload.stop,
          passThreshold:
            action.payload.stop === null &&
            state.updatingStopXPos !== action.payload.xPos &&
            state.editing !== null
        },
        updatingStopXPos: action.payload.xPos
      };

    case TOGGLE_ACTIVE_COLOR_PICKER:
      return {
        ...state,
        updating: {
          ...state.updating,
          pickingColorStop: action.payload.stop
        }
      };

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
      };

    case UPDATE_ACTIVE_STOP:
      return {
        ...state,
        updating: {
          ...state.updating,
          active: action.payload.stop
        }
      };

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
      };

    case ADD_COLOR_STOP:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.editing]: action.payload.newValues
        },
        updating: {
          ...state.updating,
          origUnchanged: action.payload.newValues
        }
      };

    case RESET_COLOR_STOP:
      return {
        ...state,
        values: {
          ...state.values,
          [action.payload.id]: INITIAL_STATE.values[action.payload.id]
        },
        updating: {
          ...INITIAL_STATE.updating,
          origUnchanged: INITIAL_STATE.values[action.payload.id]
        }
        // editingColor: INITIAL_STATE.editingColor
      };

    default:
      return state;
  }
};
