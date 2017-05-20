import Component from 'inferno-component'
import { connect } from 'inferno-redux'

import { GradientDisplay } from './components/index'
import { GradientList } from './containers/index'

import { toggleEditing } from './store/gradients/actions'

class App extends Component {
  componentDidMount () {
    document.addEventListener('keydown', this._handleKeyDown)
  }

  _handleKeyDown = e => {
    if (e.which === 27) {
      this.props.toggleEditing(null)
    }
  }

  render () {
    return (
      <GradientDisplay>
        <GradientList />
      </GradientDisplay>
    )
  }
}

export default connect(undefined, {
  toggleEditing
})(App)
