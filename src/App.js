import Component from 'inferno-component'
import { connect } from 'inferno-redux'

import { Gradient } from './common/index'
import { Swatch } from './components/index'

import { updateColorStop } from './store/gradients/actions'

class App extends Component {
  state = {
    index: 0
  }

  _handleClick = () => {
    this.setState(prevState => {
      if (
        this.state.index ===
        Object.values(this.props.gradientValues).length - 1
      ) {
        return {
          index: 0
        }
      } else {
        return {
          index: prevState.index + 1
        }
      }
    })
  }

  getColors () {
    const { gradientValues } = this.props

    const { gradient } = Object.values(gradientValues)[this.state.index]
    return Object.keys(gradient).map(stop => gradient[stop].color)
  }

  render () {
    const { gradientValues, updateColorStop } = this.props
    const { id } = Object.values(gradientValues)[this.state.index]
    return (
      <div>
        <button onClick={this._handleClick}>
          New Color
        </button>
        <Gradient
          transitionDuration={400}
          gradient={Object.values(gradientValues)[this.state.index]}
          styles={{ height: '300px', width: '300px', borderRadius: '50%' }}
        />
        <Swatch
          id={id}
          height={50}
          colors={this.getColors()}
          updateColorStop={updateColorStop}
        />
      </div>
    )
  }
}

export default connect(
  state => ({ gradientValues: state.gradients.gradientValues }),
  {
    updateColorStop
  }
)(App)
