import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Container = styled.div`
  position: relative;
`

const Item = styled.div`
  height: 25px;
  width: 25px;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0px 0px 1px 2px rgba(0, 0, 0, 0.05);
  margin-left: 10px;

  &:hover {
    transform: scale(1.1)
  }
`

const SwatchItem = ({ style, onSortItemClick }) => {
  return (
    <Container>
      <Item style={style} onClick={onSortItemClick} />
    </Container>
  )
}

export default SwatchItem
