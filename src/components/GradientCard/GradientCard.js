import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'

import { angleToLines } from './../../utils/angle'

import MainGradient from './../Gradients/MainGradient'
import GaussinGradient from './../Gradients/GaussinGradient'
import { AddColor, AnglePreview } from './../index'

const ANIMATION_DURATION = 200

const Container = styled.div`
  width: 33.33%;
  height: 450px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 33.33px;
  position: relative;
`

const ArrowContainer = styled.div`
  position: absolute;
  left: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  cursor: pointer;
`

const SwatchContainer = styled.div`
  position: relative;
  margin-top: 20px;
  width: 100%;
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
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
      addColor: false
    }
  }

  _handleMouseEnter = el => {
    const newState = { ...this.state }
    newState.hovered[el] = true

    this.setState(newState)
  }

  _handleMouseLeave = el => {
    const newState = { ...this.state }
    newState.hovered[el] = false

    this.setState(newState)
  }

  render () {
    const { hovered: { arrowPrev, addColor } } = this.state
    const { gradient: { gradient, angle }, children } = this.props
    const lines = angleToLines(angle)
    const Stops = StopKeys({ gradient })
    return (
      <Container>
        <MainGradient stops={Stops} lines={lines} />

        <GaussinGradient stops={Stops} opacity={0.7} lines={lines} />
        <SwatchContainer>

          <ArrowContainer
            onMouseEnter={() => this._handleMouseEnter('arrowPrev')}
            onMouseLeave={() => this._handleMouseLeave('arrowPrev')}
          >
            <AnglePreview
              angle={angle}
              duration={ANIMATION_DURATION}
              hovered={arrowPrev}
            />
          </ArrowContainer>

          {children}

          <AddColorContainer
            onMouseEnter={() => this._handleMouseEnter('addColor')}
            onMouseLeave={() => this._handleMouseLeave('addColor')}
          >
            <AddColor duration={ANIMATION_DURATION} hovered={addColor} />
          </AddColorContainer>

        </SwatchContainer>

      </Container>
    )
  }
}

export default GradientCard
