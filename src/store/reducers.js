import { combineReducers } from 'redux'
import gradients from './gradients/reducer'
import stops from './stops/reducer'

export default combineReducers({
  gradients,
  stops
})
