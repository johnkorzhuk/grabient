import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import { Animate } from 'react-move'

import { generateColorStopsFromData } from './../../utils/gradient'

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 15px;
`

const Gradient = ({ gradient, transitionDuration, data, angle, children }) => {
  return (
    <Animate data={data} duration={transitionDuration}>
      {data => {
        return (
          <Container
            style={{
              backgroundImage: `linear-gradient(${angle}deg, ${generateColorStopsFromData(data)})`,
              height: '100%',
              width: '100%'
            }}
          >
            {children}
          </Container>
        )
      }}
    </Animate>
  )
}

export default Gradient
