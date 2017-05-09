import { render } from 'inferno'
import 'inferno-devtools'
import { Provider } from 'inferno-redux'

import './index.css'

import store from './store/store'
import App from './App'

render(
  <Provider store={store}><App /></Provider>,
  document.getElementById('app')
)
