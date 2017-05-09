import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import ArrowIcon from 'react-icons/lib/md/keyboard-backspace'
import { Animate } from 'react-move'

const Arrow = styled(ArrowIcon)`
  width: 40px
  height: 40px;
  transform: ${({ angle }) => `rotate(${angle + 90}deg)`};
  transform-origin: right center;
`

const AngleArrow = ({ angle }) => {
  if (angle % 360 <= 0) {
    return <Arrow angle={angle} />
  } else {
    return (
      <Animate
        default={{
          rotate: angle + 90
        }}
        data={{
          rotate: angle + 90
        }}
        duration={300}
      >
        {data => (
          <Arrow
            style={{
              transform: `rotate(${data.rotate}deg)`
            }}
          />
        )}
      </Animate>
    )
  }
}

export default AngleArrow
