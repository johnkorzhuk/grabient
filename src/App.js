import Component from 'inferno-component'
import { connect } from 'inferno-redux'
import styled from 'styled-components'

import { GradientDisplay } from './components/index'
import { GradientList } from './containers/index'

import { toggleEditing } from './store/gradients/actions'
import { editStop } from './store/stops/actions'

const Overlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
`

class App extends Component {
  componentDidMount () {
    document.addEventListener('keydown', this._handleCancelEdits)
  }

  _handleCancelEdits = e => {
    if ((e.type === 'keydown' && e.which === 27) || e.type === 'click') {
      this.props.toggleEditing(null)
      this.props.editStop(null)
    }
  }

  render () {
    const { editing } = this.props
    return (
      <GradientDisplay>

        <GradientList />
        {editing && <Overlay onClick={this._handleCancelEdits} />}
      </GradientDisplay>
    )
  }
}

export default connect(
  state => ({
    editing: state.gradients.editingAngle.id !== null ||
      state.stops.editing !== null
  }),
  {
    toggleEditing,
    editStop
  }
)(App)
