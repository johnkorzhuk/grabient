import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { connect } from 'inferno-redux'
import { Animate } from 'react-move'

import { generateGradientFromData } from './../../utils/gradient'

const GradientContainer = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
`

const Gradient = ({ gradient, transitionDuration, sorting, children }) => {
  let data = Object.keys(gradient.gradient).reduce((aggr, curr) => {
    aggr[`${curr}Color`] = gradient.gradient[curr].color
    aggr[`${curr}Stop`] = gradient.gradient[curr].stop
    return aggr
  }, {})
  data.angle = gradient.angle

  if (data.angle % 360 <= 0 && !sorting) {
    return (
      <GradientContainer
        style={{
          backgroundImage: generateGradientFromData(data),
          height: '100%',
          width: '100%'
        }}
      >
        {children}
      </GradientContainer>
    )
  } else {
    return (
      <Animate data={data} duration={transitionDuration}>
        {data => {
          return (
            <GradientContainer
              style={{
                backgroundImage: generateGradientFromData(data),
                height: '100%',
                width: '100%'
              }}
            >
              {children}
            </GradientContainer>
          )
        }}
      </Animate>
    )
  }
}

export default connect(state => ({ sorting: state.swatch.sorting }))(Gradient)
