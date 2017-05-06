import Component from 'inferno-component'
import styled from 'styled-components'

const TRANSITION_DURATION = 300

const Main = styled.div`
  width: 500px;
  height: 500px;
  border-radius: 50%;
  position: relative;
  z-index: 10;
  
  background-image: linear-gradient(
    180deg,
    ${props => props.color1} 0%,
    ${props => props.color2} 100%
  );
`

const Hack = styled.div`
  height: 100%;
  width: 100%;
  border-radius: 50%;
  z-index: -1;
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  opacity: ${props => props.opacity};
  background-image: linear-gradient(
    180deg,
    ${props => props.color1} 0%,
    ${props => props.color2} 100%
  );

  transition: opacity ${props => props.duration}ms linear;
`

const initState = {
  nextColors: new Array(2),
  currColors: new Array(2),
  opacity: 0
}

class Gradient extends Component {
  state = initState

  componentDidMount () {
    this.setState({
      currColors: [this.props.colors.color1, this.props.colors.color2]
    })
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.colors !== nextProps.colors) {
      this.setState({
        nextColors: [nextProps.colors.color1, nextProps.colors.color2],
        currColors: [this.props.colors.color1, this.props.colors.color2],
        opacity: 1
      })
      setTimeout(
        () =>
          this.setState({
            opacity: 0,
            currColors: [nextProps.colors.color1, nextProps.colors.color2]
          }),
        TRANSITION_DURATION
      )
    }
  }

  render () {
    const { nextColors, currColors, opacity } = this.state

    return (
      <div>
        <Main color1={currColors[0]} color2={currColors[1]}>
          <Hack
            color1={nextColors[0]}
            color2={nextColors[1]}
            duration={TRANSITION_DURATION}
            opacity={opacity}
          />
        </Main>
      </div>
    )
  }
}

export default Gradient
