import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

import { angleToLines } from './../../utils/angle'

import MainGradient from './../Gradients/MainGradient'
import GaussinGradient from './../Gradients/GaussinGradient'
import { AddColor, AnglePreview } from './../index'

const padding = '50px'

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

const SwatchContainer = styled.div`
  position: relative;
  margin-top: 30px;
  width: 100%;
  align-self: flex-end;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`

const IconContainer = styled.div`
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

const GradientCard = ({ gradient: { gradient, angle }, children }) => {
  const lines = angleToLines(angle)
  const Stops = StopKeys({ gradient })
  return (
    <Container>
      <MainGradient stops={Stops} lines={lines} />

      <GaussinGradient
        stops={Stops}
        padding={padding}
        opacity={0.7}
        lines={lines}
      />
      <SwatchContainer>
        <AnglePreview angle={angle} />
        {children}
        <IconContainer>
          <AddColor />
        </IconContainer>
      </SwatchContainer>

    </Container>
  )
}

export default GradientCard
