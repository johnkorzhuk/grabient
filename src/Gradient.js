import Component from 'inferno-component'
import styled from 'styled-components'

import Sortable from './Sortable'

import { generateLinearGradient } from './utils/gradient'

const TRANSITION_DURATION = 300

const Main = styled.div`
  width: 500px;
  height: 500px;
  border-radius: 50%;
  z-index: 10;
  
  background-image: ${({ gradient }) => generateLinearGradient(gradient)}
`

const TransitionHack = styled.div`
  height: 100%;
  width: 100%;
  border-radius: 50%;
  z-index: -1;
  opacity: ${({ opacity }) => opacity};
  background-image: ${({ gradient }) => generateLinearGradient(gradient)}

  transition: opacity ${({ duration }) => duration}ms linear;
`

const initState = {
  nextGradient: null,
  currGradient: null,
  opacity: 0
}

class Gradient extends Component {
  state = initState

  componentDidMount () {
    this.setState({
      currGradient: this.props.gradient
    })
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.gradient !== nextProps.gradient) {
      this.setState({
        nextGradient: nextProps.gradient,
        currGradient: this.props.gradient,
        opacity: 1
      })
      setTimeout(
        () =>
          this.setState({
            opacity: 0,
            currGradient: nextProps.gradient
          }),
        TRANSITION_DURATION
      )
    }
  }

  getColors () {
    const { gradient } = this.props.gradient

    return Object.keys(gradient).map(stop => gradient[stop].color)
  }

  render () {
    const { nextGradient, currGradient, opacity } = this.state
    return (
      currGradient &&
      <div>
        <Main gradient={currGradient}>
          <TransitionHack
            gradient={nextGradient}
            duration={TRANSITION_DURATION}
            opacity={opacity}
          />
        </Main>
        <Sortable height={100} colors={this.getColors()} />
      </div>
    )
  }
}

export default Gradient
