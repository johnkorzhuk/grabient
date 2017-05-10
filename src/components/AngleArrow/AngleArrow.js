import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'
import ArrowIcon from 'react-icons/lib/md/keyboard-backspace'
import { Animate } from 'react-move'

const Arrow = styled(ArrowIcon)`
  width: 15px
  height: 15px;
  transform: ${({ angle }) => `rotate(${angle + 90}deg)`} translate(-20px);
  transform-origin: right center;
  color: black;
`

const AngleArrow = ({ angle, styles }) => {
  if (angle % 360 <= 0) {
    return <Arrow angle={angle} style={{ ...styles }} />
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
            angle={angle}
            style={{
              transform: `rotate(${data.rotate}deg) translate(-20px)`,
              ...styles
            }}
          />
        )}
      </Animate>
    )
  }
}

export default AngleArrow
