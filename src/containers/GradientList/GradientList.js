import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { connect } from 'inferno-redux'
import styled from 'styled-components'

import { getGradients } from './../../store/gradients/selectors'
import {
  updateColorStop,
  updateGradientAngle
} from './../../store/gradients/actions'

import { Card, AngleArrow } from './../../components/index'
import { Swatch, Gradient } from './../index'

const TRANSITION_DURATION = 400

const getColors = ({ gradient }) => {
  return Object.keys(gradient).map(stop => gradient[stop].color)
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
`

const GradientContainer = styled.div`
  height: 75%;
`

const InfoContainer = styled.div`
  height: 20%;
  display: flex;
  align-items: center;
`

const ArrowContainer = styled.div`
  width: 70px;
  height: 70px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
`

const ArrowBox = styled.div`
  filter: opacity(25%);;
  background-color: white;
  position: absolute;
  height: 100%;
  width: 100%;
  border-radius: 50%;
`

const SwatchContainer = styled.div`
  height: 5%;
`

const GradientList = ({ gradients, updateColorStop, updateGradientAngle }) => (
  <Container>
    {Object.keys(gradients).map(gradientKey => {
      const gradient = gradients[gradientKey]
      const { angle } = gradient
      // let value = angle
      // if (angle >= 360) value %= 360
      // else if (angle < 0) value += 360

      return (
        <Card>
          <GradientContainer>
            <Gradient
              gradient={gradient}
              transitionDuration={TRANSITION_DURATION}
            />
          </GradientContainer>
          <InfoContainer>
            <ArrowContainer>
              <ArrowBox />
              <AngleArrow
                angle={angle}
                styles={{ position: 'absolute', right: '50%' }}
              />
            </ArrowContainer>
          </InfoContainer>
          <SwatchContainer>
            <Swatch
              id={gradientKey}
              updateColorStop={updateColorStop}
              transitionDuration={TRANSITION_DURATION}
              colors={getColors(gradient)}
            />
          </SwatchContainer>

        </Card>
      )
    })}
  </Container>
)

// <input
//               type='number'
//               value={value}
//               onChange={e =>
//                 updateGradientAngle(gradientKey, parseInt(e.target.value, 10))}
//             />

export default connect(state => ({ gradients: getGradients(state) }), {
  updateColorStop,
  updateGradientAngle
})(GradientList)
