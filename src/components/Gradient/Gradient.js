import Component from 'inferno-component'
import styled from 'styled-components'

import { generateLinearGradient } from './../../utils/gradient'

const MainWrapper = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
`

const Main = styled.div`
  position: ${({ wrapper }) => (wrapper ? 'absolute' : 'block')};
  width: ${({ styles, wrapper }) => (wrapper ? `${parseFloat(styles.width) * 1.01}px` : styles.width)};
  height: ${({ styles, wrapper }) => (wrapper ? `${parseFloat(styles.height) * 1.01}px` : styles.height)};
  border-radius: ${({ styles }) => styles.borderRadius};
  z-index: 10;
  
  background-image: ${({ gradient, wrapper }) => generateLinearGradient(gradient, wrapper)}
`

const TransitionHack = styled.div`
  height: 100%;
  width: 100%;
  border-radius: ${({ styles }) => styles.borderRadius};
  z-index: -1;
  opacity: ${({ opacity }) => opacity};
  background-image: ${({ gradient, wrapper }) => generateLinearGradient(gradient, wrapper)}

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
    const { styles, transitionDuration, wrapper } = this.props

    if (wrapper) {
      return (
        currGradient &&
        <MainWrapper>
          <Main gradient={currGradient} styles={styles} wrapper>
            <TransitionHack
              gradient={nextGradient}
              duration={transitionDuration}
              opacity={opacity}
              styles={styles}
              wrapper
            />
          </Main>
          <Main gradient={currGradient} styles={styles}>
            <TransitionHack
              gradient={nextGradient}
              duration={transitionDuration}
              opacity={opacity}
              styles={styles}
            />
          </Main>
        </MainWrapper>
      )
    } else {
      return (
        currGradient &&
        <MainWrapper>
          <Main gradient={currGradient} styles={styles}>
            <TransitionHack
              gradient={nextGradient}
              duration={transitionDuration}
              opacity={opacity}
              styles={styles}
            />
          </Main>
        </MainWrapper>
      )
    }
  }
}

export default Gradient
