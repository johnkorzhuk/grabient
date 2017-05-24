import React from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import { getGradients } from './../../store/gradients/selectors'

import { GradientCard } from './../index'

const Container = styled.div`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
`

const GradientList = ({ gradients, updateColorStop, updateGradientAngle }) => {
  return (
    <Container>
      {Object.keys(gradients).map((gradientKey, index) => {
        const gradient = gradients[gradientKey]
        return (
          <GradientCard
            gradient={gradient}
            index={index}
            width='33.33%'
            id={gradientKey}
            key={gradientKey}
          />
        )
      })}
    </Container>
  )
}

export default connect(state => ({ gradients: getGradients(state) }))(
  GradientList
)
