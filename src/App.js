import { version } from 'inferno'
import Component from 'inferno-component'
import styled from 'styled-components'

import Gradient from './Gradient'

const Container = styled.div`
  background-color: red;
`

const colors = [
  {
    color1: '#fad0c4',
    color2: '#ffd1ff'
  },
  {
    color1: '#e0c3fc',
    color2: '#8ec5fc'
  },
  {
    color1: '#43e97b',
    color2: '#fee140'
  },
  {
    color1: '#f5f7fa',
    color2: '#c3cfe2'
  }
]

class App extends Component {
  state = {
    index: 0
  }

  _handleClick = () => {
    this.setState(prevState => {
      if (this.state.index === Object.keys(colors).length - 1) {
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

  render () {
    return (
      <div>
        <button onClick={this._handleClick}>
          New Color
        </button>
        <Gradient colors={colors[this.state.index]} />
      </div>
    )
  }
}

export default App
