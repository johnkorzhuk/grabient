import React from 'react'
import styled from 'styled-components'

import { Container, Logo } from './../Common/index'

const LogoContainer = styled.div`
  margin-bottom: 40px;
`

const GradientDisplayContainer = Container.extend`
  margin-top: 55px;
  margin-bottom: 30px;
  text-align: center;
`

const Section = GradientDisplayContainer.withComponent('section')

const Hero = () => {
  return (
    <Section>
      <LogoContainer>
        <Logo />
      </LogoContainer>
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
