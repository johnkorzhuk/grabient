import React from 'react'

import { Container } from './../Common/index'

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
