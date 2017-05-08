import Component from 'inferno-component'
import styled from 'styled-components'

import { generateLinearGradient } from './../../utils/gradient'

const Main = styled.div`
  width: ${({ styles }) => styles.width};
  height: ${({ styles }) => styles.height};
  border-radius: ${({ styles }) => styles.borderRadius};
  z-index: 10;
  
  background-image: ${({ gradient }) => generateLinearGradient(gradient)}
`

const TransitionHack = styled.div`
  height: 100%;
  width: 100%;
  border-radius: ${({ styles }) => styles.borderRadius};
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
        this.props.transitionDuration
      )
    }
  }

  render () {
    const { nextGradient, currGradient, opacity } = this.state
    const { styles, transitionDuration } = this.props

    return (
      currGradient &&
      <Main gradient={currGradient} styles={styles}>
        <TransitionHack
          gradient={nextGradient}
          duration={transitionDuration}
          opacity={opacity}
          styles={styles}
        />
      </Main>
    )
  }
}

export default Gradient
