import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Item = styled.div`
  height: 20px;
  width: 20px;
  border-radius: 50%;
  cursor: pointer;
  position: absolute;
  box-shadow: inset 0px 0px 0px 2px rgba(0, 0, 0, 0.05);

  &:hover {
    transform: scale(1.1);
  }
`

const SwatchItem = ({ style, onClick }) => {
  return <Item style={style} onClick={onClick} />
}

export default SwatchItem
