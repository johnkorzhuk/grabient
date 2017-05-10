import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { connect } from 'inferno-redux'
import { Animate } from 'react-move'

import { generateGradientFromData } from './../../utils/gradient'

const Container = styled.div`
  height: 400px;
  width: 400px;
`

const Gradient = ({ gradient, transitionDuration, sorting }) => {
  let data = Object.keys(gradient.gradient).reduce((aggr, curr) => {
    aggr[`${curr}Color`] = gradient.gradient[curr].color
    aggr[`${curr}Stop`] = gradient.gradient[curr].stop
    return aggr
  }, {})
  data.angle = gradient.angle

  if (data.angle % 360 <= 0 && !sorting) {
    return (
      <Container>
        <div
          style={{
            backgroundImage: generateGradientFromData(data),
            height: '100%',
            width: '100%'
          }}
        />
      </Container>
    )
  } else {
    return (
      <Container>
        <Animate data={data} duration={transitionDuration}>
          {data => {
            return (
              <div
                style={{
                  backgroundImage: generateGradientFromData(data),
                  height: '100%',
                  width: '100%'
                }}
              />
            )
          }}
        </Animate>
      </Container>
    )
  }
}

export default connect(state => ({ sorting: state.swatch.sorting }))(Gradient)
