import Component from 'inferno-component'
import styled from 'styled-components'
import { connect } from 'inferno-redux'
// import { Animate } from 'react-move'

import { angleToLines } from './../../utils/angle'

import { toggleEditing } from './../../store/gradients/actions'

import MainGradient from './../../components/Gradients/MainGradient'
import GaussinGradient from './../../components/Gradients/GaussinGradient'
import { AnglePreview } from './../../components/index'
import { AddColor } from './../../components/Icons/index'
import { AngleWheel } from './../index'

const ANIMATION_DURATION = 200

const Container = styled.div`
  width: 33.33%;
  height: 450px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 45px 33.33px;
  position: relative;
`

const AngleContainer = styled.div`
  position: absolute;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`

const AngleText = styled.div`
  font-size: 1.6rem;
  color: #AFAFAF;
  padding-left: 10px;
`

const SwatchContainer = styled.div`
  position: relative;
  margin-top: 20px;
  width: 100%;
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  z-index: 10;
`

const AddColorContainer = styled.div`
  height: 25px;
  margin-left: 15px;
  cursor: pointer;
`

const StopKeys = ({ gradient }) => {
  const stopKeys = Object.keys(gradient)
  return stopKeys.map(stopKey => (
    <stop
      key={stopKey}
      stop-color={gradient[stopKey].color}
      offset={gradient[stopKey].stop + '%'}
    />
  ))
}

class GradientCard extends Component {
  state = {
    hovered: {
      arrowPrev: false,
      addColor: false,
      main: false
    },
    wasEditing: false
  }

  componentWillReceiveProps (nextProps) {
    const { gradient } = this.props
    if (gradient.editing !== nextProps.gradient.editing) {
      this.setState({ wasEditing: !nextProps.gradient.editing })
    }
  }

  _handleMouseEnter = (e, el) => {
    const newState = { ...this.state }
    newState.hovered[el] = true
    this.setState(newState)
  }

  _handleMouseLeave = (e, el) => {
    const newState = { ...this.state }
    newState.hovered[el] = false
    newState.wasEditing = false

    this.setState(newState)
  }

  render () {
    const { hovered: { arrowPrev, addColor, main }, wasEditing } = this.state
    const {
      gradient: { gradient, angle },
      children,
      id,
      toggleEditing
    } = this.props
    const lines = angleToLines(angle)
    const Stops = StopKeys({ gradient })
    return (
      <Container onMouseMove={e => e}>

        <MainGradient
          duration={ANIMATION_DURATION}
          stops={Stops}
          lines={lines}
          hovered={main}
          id={id}
          wasEditing={wasEditing}
          angle={angle}
          onMouseEnter={e => this._handleMouseEnter(e, 'main')}
          onMouseLeave={e => this._handleMouseLeave(e, 'main')}
        />

        <AngleWheel
          angle={angle}
          id={id}
          transitionDuration={ANIMATION_DURATION}
        />

        <GaussinGradient
          innerRef={node => {
            this.container = node
          }}
          stops={Stops}
          opacity={0.7}
          lines={lines}
          id={id}
        />

        <SwatchContainer>
          <AngleContainer
            onClick={() => toggleEditing(id)}
            onMouseEnter={e => this._handleMouseEnter(e, 'arrowPrev')}
            onMouseLeave={e => this._handleMouseLeave(e, 'arrowPrev')}
          >
            <AnglePreview
              angle={angle}
              duration={ANIMATION_DURATION}
              hovered={arrowPrev}
            />
            <AngleText>{angle}°</AngleText>
          </AngleContainer>

          {children}

          <AddColorContainer
            onMouseEnter={e => this._handleMouseEnter(e, 'addColor')}
            onMouseLeave={e => this._handleMouseLeave(e, 'addColor')}
          >
            <AddColor
              duration={ANIMATION_DURATION}
              hovered={addColor}
              color='#AFAFAF'
            />
          </AddColorContainer>
        </SwatchContainer>
      </Container>
    )
  }
}

export default connect(undefined, { toggleEditing })(GradientCard)
