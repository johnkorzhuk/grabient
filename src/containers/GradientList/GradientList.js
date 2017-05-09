import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { connect } from 'inferno-redux'
import styled from 'styled-components'

import ArrowIcon from 'react-icons/lib/md/keyboard-backspace'

import { getGradients } from './../../store/gradients/selectors'
import { updateColorStop } from './../../store/gradients/actions'

import { Card, Gradient, Swatch } from './../../components/index'

const TRANSITION_DURATION = 400

const getColors = ({ gradient }) => {
  return Object.keys(gradient).map(stop => gradient[stop].color)
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
`

const Arrow = styled(ArrowIcon)`
  width: 40px
  height: 40px;
  transform: rotate(44deg);
  transform-origin: right center;
`

const GradientContainer = styled.div`
  height: 75%;
`

const InfoContainer = styled.div`
  height: 20%;
  display: flex;
  align-items: center;
`

const SwatchContainer = styled.div`
  height: 5%;
`

const GradientList = ({ gradients, updateColorStop }) => (
  <Container>
    {Object.keys(gradients).map(gradient => (
      <Card>
        <GradientContainer>
          <Gradient
            transitionDuration={TRANSITION_DURATION}
            gradient={gradients[gradient]}
            styles={{ height: '100%', width: '100%' }}
          />

        </GradientContainer>
        <InfoContainer>
          <Arrow />
        </InfoContainer>
        <SwatchContainer>
          <Swatch
            id={gradient}
            updateColorStop={updateColorStop}
            transitionDuration={TRANSITION_DURATION}
            colors={getColors(gradients[gradient])}
          />
        </SwatchContainer>
      </Card>
    ))}
  </Container>
)

export default connect(state => ({ gradients: getGradients(state) }), {
  updateColorStop
})(GradientList)
