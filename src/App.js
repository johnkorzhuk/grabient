import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { connect } from 'inferno-redux'

import { GradientDisplay } from './components/index'
import { GradientList } from './containers/index'

import { updateActiveId } from './store/gradients/actions'
import { getActiveGradient } from './store/gradients/selectors'

const App = ({ activeGradient, updateActiveId, activeGradientInverse }) => (
  <GradientDisplay>
    <GradientList />

  </GradientDisplay>
)

export default connect(
  state => ({
    activeGradient: getActiveGradient(state)
  }),
  {
    updateActiveId
  }
)(App)
