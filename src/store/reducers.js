import { combineReducers } from 'redux'
import gradients from './gradients/reducer'
import swatch from './swatch/reducer'

export default combineReducers({
  gradients,
  swatch
})
