import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

import { Container } from './../index'

const Section = styled.section`
  background-color: #f1f1f1;
`

const GradientDisplay = ({ children }) => {
  return (
    <Section>
      <Container>
        {children}
      </Container>
    </Section>
  )
}

export default GradientDisplay
