import React, { PureComponent } from 'react'
import TrashIconO from 'react-icons/lib/fa/trash-o'
import TrashIcon from 'react-icons/lib/fa/trash'
import { Animate } from 'react-move'
import styled from 'styled-components'

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
`

class Trash extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return this.props.inverted !== nextProps.inverted
  }

  render () {
    const { color, inverted, animationDuration } = this.props

    return (
      <Animate
        duration={animationDuration}
        data={{
          default: inverted ? 1 : 0,
          inverted: inverted ? 0 : 1
        }}
      >
        {data => {
          return (
            <Container>
              <TrashIcon
                size={20}
                color={color}
                style={{
                  position: 'absolute',
                  left: 0,
                  opacity: data.default
                }}
              />
              <TrashIconO
                size={20}
                color={color}
                style={{
                  position: 'absolute',
                  left: 0,
                  opacity: data.inverted
                }}
              />
            </Container>
          )
        }}
      </Animate>
    )
  }
}

export default Trash
