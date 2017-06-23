import { combineReducers } from 'redux'
import gradients from './gradients/reducer'
import stops from './stops/reducer'
import dimensions from './dimensions/reducer'
import icons from './icons/reducer'
import settings from './settings/reducer'

export default combineReducers({
  gradients,
  stops,
  dimensions,
  icons,
  settings
})
