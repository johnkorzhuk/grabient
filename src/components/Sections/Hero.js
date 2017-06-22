import React from 'react'
import styled from 'styled-components'

import { Container } from './../Common/index'

const GradientDisplayContainer = Container.extend`
  margin-top: 30px;
  margin-bottom: 90px;
  text-align: center;
`

const Heading = styled.h1`
  font-size: 4.5rem;
`

const Section = GradientDisplayContainer.withComponent('section')

const Hero = () => {
  return (
    <Section>
      <Heading>Grabient</Heading>
      <iframe
        title='github'
        src='https://ghbtns.com/github-btn.html?user=johnkorzhuk&repo=grabient&type=star&count=true'
        frameBorder='0'
        scrolling='0'
        width='170px'
        height='20px'
      />
    </Section>
  )
}

export default Hero
