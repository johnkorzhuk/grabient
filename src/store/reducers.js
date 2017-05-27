import { combineReducers } from 'redux'
import gradients from './gradients/reducer'
import stops from './stops/reducer'
import dimensions from './dimensions/reducer'

export default combineReducers({
  gradients,
  stops,
  dimensions
})
