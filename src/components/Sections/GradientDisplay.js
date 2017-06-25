import React from 'react'
import styled from 'styled-components'

export const GradientDisplayContainer = styled.section`
  max-width: 1100px;
  margin: 30px auto;

  @media (min-width: 820px) {
    margin-left: 40px;
    margin-right: 40px;
  }

  @media (min-width: 970px) {
    margin-left: auto;
    margin-right: auto;
  }
`

const GradientDisplay = ({ children }) => {
  return (
    <GradientDisplayContainer>
      {children}
    </GradientDisplayContainer>
  )
}

export default GradientDisplay
