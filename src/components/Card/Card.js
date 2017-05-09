import Inferno from 'inferno' // eslint-disable-line no-unused-vars
import styled from 'styled-components'

const Container = styled.div`
  width: 30%;
  height: 400px;
  display: inline-block;
  margin: 10px;
  background-color: #ffffff;
`

const Card = ({ children }) => (
  <Container>
    {children}
  </Container>
)

export default Card
