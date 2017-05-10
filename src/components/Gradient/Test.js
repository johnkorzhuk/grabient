import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { Animate } from 'react-move'

import { generateLinearGradient } from './../../utils/gradient'

const Container = styled.div`
  height: 400px;
  width: 400px;
`

const TestGradient = ({ gradient }) => {
  // console.log(gradient)
  const data = Object.keys(gradient.gradient).reduce((aggr, curr) => {
    aggr[`${curr}Color`] = gradient.gradient[curr].color
    aggr[`${curr}Stop`] = gradient.gradient[curr].stop
    return aggr
  }, {})
  return (
    <Container>
      <Animate data={data}>
        {data => {
          const newGradient = {
            angle: gradient.angle,
            gradient: Object.keys(data).reduce((aggr, curr, index) => {
              if (index % 2 === 0) {
                aggr[`stop${index + 1}`] = {
                  color: data[curr]
                }
              } else {
                aggr[`stop${index}`] = {
                  ...aggr[`stop${index}`],
                  stop: data[curr]
                }
              }

              return aggr
            }, {})
          }
          return (
            <div
              style={{
                backgroundImage: generateLinearGradient(newGradient),
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

export default TestGradient
