import React from 'react'
import styled from 'styled-components'

import { Logo } from './../Common/index'

const LogoContainer = styled.div`
  margin-bottom: 40px;
`

const GradientDisplayContainer = styled.section`
  max-width: 1100px;
  margin: 55px auto 30px;
  text-align: center;
`

const Hero = () => {
  return (
    <GradientDisplayContainer>
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
    </GradientDisplayContainer>
  )
}

export default Hero
