import React from 'react'

import { Container } from './../Common/index'

const GradientDisplayContainer = Container.extend`
  margin-top: 20px;
  margin-bottom: 20px;
`

const GradientDisplay = ({ children }) => {
  return (
    <section>
      <GradientDisplayContainer>
        {children}
      </GradientDisplayContainer>
    </section>
  )
}

export default GradientDisplay
