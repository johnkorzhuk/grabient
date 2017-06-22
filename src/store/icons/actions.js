import { generateLinearGradient } from './../../utils/gradient'
import { copyTextToClipboard } from './utils'

export const TOGGLE_TRASH_ICON = 'icons/TOGGLE_TRASH_ICON'
export const TOGGLE_CSS_COPIED = 'icons/TOGGLE_CSS_COPIED'

export const toggleTrashIcon = () => (dispatch, getState) => {
  console.log('yo')
  return dispatch({
    type: TOGGLE_TRASH_ICON
  })
}

export const copyCSS = (angle, stopData, id) => dispatch => {
  const css = generateLinearGradient(angle, stopData)
  copyTextToClipboard(css)
  dispatch({
    type: TOGGLE_CSS_COPIED,
    payload: {
      id
    }
  })

  setTimeout(() => {
    return dispatch({
      type: TOGGLE_CSS_COPIED,
      payload: {
        id: null
      }
    })
  }, 2000)
}
