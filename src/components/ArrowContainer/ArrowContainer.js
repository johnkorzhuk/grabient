import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'

import { AngleArrow } from './../index'

const Container = styled.div`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
`

const ArrowBox = styled.div`
  filter: ${({ hovered }) => `opacity(${hovered ? '100%' : '25%'}) blur(3px)`};
  background-color: ${({ hovered }) => (hovered ? '#f1f1f1' : 'white')};
  position: absolute;
  border-radius: 50%;
`

const Text = styled.input`
  color: black;
  font-size: 1.4rem;
  background-color:#f1f1f1;
  z-index: 1;
`

class ArrowContainer extends Component {
  state = {
    hovered: false
  }
  render () {
    const { angle, transitionDuration } = this.props
    const { hovered } = this.state

    return (
      <Animate
        data={{
          containerWidth: hovered ? 110 : 30,
          containerSpacing: hovered ? 0 : 20,
          boxWidth: hovered ? 80 : 30,
          arrowTranslateX: hovered ? -20 : 8,
          arrowOpacity: hovered ? 1 : 0.6,
          textOpacity: hovered ? 1 : 0
        }}
        duration={transitionDuration}
      >
        {data => (
          <Container
            onMouseEnter={() => this.setState(() => ({ hovered: true }))}
            onMouseLeave={() => this.setState(() => ({ hovered: false }))}
            style={{
              width: data.containerWidth,
              height: data.containerWidth,
              bottom: data.containerSpacing,
              left: data.containerSpacing
            }}
          >
            <Text
              type='number'
              style={{
                opacity: hovered ? data.textOpacity : 0
              }}
            >
              359deg
            </Text>
            <ArrowBox
              hovered={hovered}
              style={{
                width: data.boxWidth,
                height: data.boxWidth
              }}
            />
            <AngleArrow
              angle={angle}
              styles={{
                position: 'absolute',
                right: '50%',
                fillOpacity: data.arrowOpacity
              }}
              translateX={data.arrowTranslateX}
              transitionDuration={transitionDuration}
            />
          </Container>
        )}
      </Animate>
    )
  }
}

export default ArrowContainer
