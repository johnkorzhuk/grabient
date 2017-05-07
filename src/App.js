import Component from 'inferno-component'
// import styled from 'styled-components'

import Gradient from './Gradient'

const gradients = [
  {
    angle: 180,
    gradient: {
      stop1: {
        color: '#fad0c4',
        stop: 0
      },
      stop2: {
        color: '#ffd1ff',
        stop: 100
      }
    }
  },
  {
    angle: 110,
    gradient: {
      stop1: {
        color: '#e0c3fc',
        stop: 0
      },
      stop2: {
        color: '#8ec5fc',
        stop: 50
      },
      stop3: {
        color: '#43e97b',
        stop: 100
      }
    }
  },
  {
    angle: 180,
    gradient: {
      stop1: {
        color: '#fad0c4',
        stop: 0
      },
      stop2: {
        color: '#fee140',
        stop: 25
      },
      stop3: {
        color: '#8ec5fc',
        stop: 50
      },
      stop4: {
        color: '#43e97b',
        stop: 100
      }
    }
  },
  {
    angle: 180,
    gradient: {
      stop1: {
        color: '#f5f7fa',
        stop: 0
      },
      stop2: {
        color: '#c3cfe2',
        stop: 70
      },
      stop3: {
        color: '#fad0c4',
        stop: 100
      }
    }
  }
]

class App extends Component {
  state = {
    index: 0
  }

  _handleClick = () => {
    this.setState(prevState => {
      if (this.state.index === Object.keys(gradients).length - 1) {
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
        <Gradient gradient={gradients[this.state.index]} />
      </div>
    )
  }
}

export default App
