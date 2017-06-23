import React from 'react'
// import styled from 'styled-components'

import { Container } from './../Common/index'
import { Heading1 } from './../Common/Typography'

const GradientDisplayContainer = Container.extend`
  margin-top: 30px;
  margin-bottom: 30px;
  text-align: center;
`

const Section = GradientDisplayContainer.withComponent('section')

const Hero = () => {
  return (
    <Section>
      <Heading1>Grabient</Heading1>
      <iframe
        title='github'
        src='https://ghbtns.com/github-btn.html?user=johnkorzhuk&repo=grabient&type=star&count=true'
        frameBorder='0'
        scrolling='0'
        width='80px'
        height='20px'
      />
    </Section>
  )
}

export default Hero
