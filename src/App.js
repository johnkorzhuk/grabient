import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { connect } from 'inferno-redux'

import { Gradient } from './components/index'
import { Swatch } from './containers/index'

import { updateActiveId } from './store/gradients/actions'
import { getActiveGradient } from './store/gradients/selectors'

const App = ({ activeGradient, updateActiveId }) => (
  <div>
    <button onClick={() => updateActiveId()}>
      New Color
    </button>
    <Gradient
      transitionDuration={400}
      gradient={activeGradient}
      styles={{ height: '300px', width: '300px', borderRadius: '50%' }}
    />
    <Swatch height={50} />
  </div>
)

export default connect(
  state => ({
    activeGradient: getActiveGradient(state)
  }),
  {
    updateActiveId
  }
)(App)
