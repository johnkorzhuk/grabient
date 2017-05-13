import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

import MainGradient from './MainGradient'
import GuassinGradient from './GaussinGradient'

const padding = '50px'

const Container = styled.div`
  width: 33.33%;
  height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: ${padding};
  position: relative;
`

const Gradient = ({ gradient: { gradient, angle } }) => {
  return (
    <Container>

      <MainGradient gradient={gradient} angle={angle} />

      <GuassinGradient
        gradient={gradient}
        padding={padding}
        opacity={0.7}
        angle={angle}
      />

    </Container>
  )
}

export default Gradient
