import {
  UPDATE_ANGLE,
  UPDATE_ACTIVE_ID,
  TOGGLE_EDITING_ANGLE,
  UPDATE_EDITING_ANGLE,
  UPDATE_EXPANDED,
  UPDATE_EDITED_STATE,
  RESET_GRADIENT_ANGLE,
  UPDATE_PAGE
} from './actions'

export const INITIAL_STATE = {
  gradientValues: {
    '8de97c99-10e8-4200-9bca-f01ad3dac544': {
      id: '8de97c99-10e8-4200-9bca-f01ad3dac544',
      angle: 45,
      edited: false
    },
    '9fa2b461-0847-47fc-86fd-ae81b352d383': {
      id: '9fa2b461-0847-47fc-86fd-ae81b352d383',
      angle: 45,
      edited: false
    },
    '6c26cc7c-35d4-4316-ae1c-af247c637be6': {
      id: '6c26cc7c-35d4-4316-ae1c-af247c637be6',
      angle: 135,
      edited: false
    },
    'a17d5049-3a60-4040-8751-563fd0d4eff5': {
      id: 'a17d5049-3a60-4040-8751-563fd0d4eff5',
      angle: 180,
      edited: false
    },
    '8aecc400-30f6-42b1-b277-cfbb479293c3': {
      id: '8aecc400-30f6-42b1-b277-cfbb479293c3',
      angle: 19,
      edited: false
    },
    '057d18a3-1f75-4ca8-bff7-71d211b1bf55': {
      id: '057d18a3-1f75-4ca8-bff7-71d211b1bf55',
      angle: 43,
      edited: false
    },
    '649c7b5e-b2d5-4e93-ad67-51d9be2321f3': {
      id: '649c7b5e-b2d5-4e93-ad67-51d9be2321f3',
      angle: 45,
      edited: false
    },
    '70bc9b1d-352e-48fc-af29-1f5cad8a8103': {
      id: '70bc9b1d-352e-48fc-af29-1f5cad8a8103',
      angle: 0,
      edited: false
    },
    '9e54c561-a249-4275-81d2-e5ce6458a9b6': {
      id: '9e54c561-a249-4275-81d2-e5ce6458a9b6',
      angle: 90,
      edited: false
    },
    'b4da6cdd-c43e-4796-bd35-960d07d0e956': {
      id: 'b4da6cdd-c43e-4796-bd35-960d07d0e956',
      angle: 19,
      edited: false
    },
    '8a6b7dd4-b7d5-4a89-a472-baf98932154d': {
      id: '8a6b7dd4-b7d5-4a89-a472-baf98932154d',
      angle: 19,
      edited: false
    },
    '72dc83ee-28ac-4e81-acec-545b7f92bd7b': {
      id: '72dc83ee-28ac-4e81-acec-545b7f92bd7b',
      angle: 0,
      edited: false
    },
    'cf5948b4-eb69-43ab-af89-d6b2b5789551': {
      id: 'cf5948b4-eb69-43ab-af89-d6b2b5789551',
      angle: 90,
      edited: false
    },
    '144be87e-63ca-448f-8cc5-94d2a59a1c22': {
      id: '144be87e-63ca-448f-8cc5-94d2a59a1c22',
      angle: 62,
      edited: false
    },
    '50e52b42-b967-4370-b073-630a1d5be027': {
      id: '50e52b42-b967-4370-b073-630a1d5be027',
      angle: 62,
      edited: false
    },
    'f4612216-e93a-424a-99c6-e10d4939f238': {
      id: 'f4612216-e93a-424a-99c6-e10d4939f238',
      angle: 225,
      edited: false
    },
    '1faf4399-7c49-40ca-8c31-7558c358436d': {
      id: '1faf4399-7c49-40ca-8c31-7558c358436d',
      angle: 0,
      edited: false
    },
    '433c9b4d-d9cb-42aa-b24b-959284f64d4c': {
      id: '433c9b4d-d9cb-42aa-b24b-959284f64d4c',
      angle: 90,
      edited: false
    },
    'a09019e6-8a63-4dcc-bfc3-c10324523f15': {
      id: 'a09019e6-8a63-4dcc-bfc3-c10324523f15',
      angle: 132,
      edited: false
    },
    '071f4579-381e-45fd-8f58-89d9a64234a4': {
      id: '071f4579-381e-45fd-8f58-89d9a64234a4',
      angle: 160,
      edited: false
    },
    'b3e87cb9-036b-43ec-a89c-7d1272ce1a23': {
      id: 'b3e87cb9-036b-43ec-a89c-7d1272ce1a23',
      angle: 90,
      edited: false
    }
  },
  expanded: null,
  editingAngle: {
    id: null,
    angle: null
  },
  page: 1
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

    case UPDATE_PAGE:
      return {
        ...state,
        page: action.payload.page
      }

    default:
      return state
  }
}
