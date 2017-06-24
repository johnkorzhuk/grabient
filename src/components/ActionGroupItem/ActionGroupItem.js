import React, { Component, cloneElement } from 'react'
import styled from 'styled-components'
import { Animate } from 'react-move'

const Container = styled.div`
  display: flex;
  margin-right: 30px;
`

const ItemContainer = styled.div`
  margin-left: ${({ ml }) => ml + 'px'};
`

class ActionGroupItem extends Component {
  state = {
    hovered: false
  }

  _handleMouseEnter = () => {
    this.setState({
      hovered: true
    })
  }

  _handleMouseLeave = () => {
    this.setState({
      hovered: false
    })
  }

  render () {
    const { children, ml = 10, itemStyle, style, id } = this.props
    const { hovered } = this.state

    return (
      <Animate
        data={{
          color: hovered ? '#2A2A2A' : '#AFAFAF'
        }}
      >
        {data => {
          return (
            <Container
              onMouseEnter={this._handleMouseEnter}
              onMouseLeave={this._handleMouseLeave}
              style={style}
            >
              {cloneElement(children[0], {
                style: {
                  color: data.color
                }
              })}
              <ItemContainer ml={ml} style={itemStyle}>
                {cloneElement(children[1], {
                  color: data.color,
                  id
                })}
              </ItemContainer>
            </Container>
          )
        }}
      </Animate>
    )
  }
}

export default ActionGroupItem
