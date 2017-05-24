import React from 'react'

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
