import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import { connect } from 'inferno-redux'
import styled from 'styled-components'

import { getGradients } from './../../store/gradients/selectors'
import {
  updateColorStop,
  updateGradientAngle
} from './../../store/gradients/actions'

import { Swatch, GradientCard } from './../index'

const TRANSITION_DURATION = 400

const getColors = ({ gradient }) => {
  return Object.keys(gradient).map(stop => gradient[stop].color)
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
`

const GradientList = ({ gradients, updateColorStop, updateGradientAngle }) => (
  <Container>
    {Object.keys(gradients).map(gradientKey => {
      const gradient = gradients[gradientKey]
      return (
        <GradientCard gradient={gradient} width='33.33%' id={gradientKey}>
          <Swatch
            id={gradientKey}
            updateColorStop={updateColorStop}
            transitionDuration={TRANSITION_DURATION}
            colors={getColors(gradient)}
          />
        </GradientCard>
      )
    })}
  </Container>
)

export default connect(state => ({ gradients: getGradients(state) }), {
  updateColorStop,
  updateGradientAngle
})(GradientList)
