import Inferno from 'inferno' // eslint-disable-line no-unused-vars

import { Container } from './../index'

const GradientDisplay = ({ children }) => {
  return (
    <section>
      <Container>
        {children}
      </Container>
    </section>
  )
}

export default GradientDisplay
