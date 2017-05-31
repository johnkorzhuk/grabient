import React, { Component } from 'react'
import { Animate } from 'react-move'

import { Button } from './../Common/index'

const Container = Button.extend`
  z-index: 1000;
  top: 16px;
  right: 16px;
  position: absolute;
`

const ExpandContractSVG = ({ color, d, ...props }) => {
  return (
    <svg
      {...props}
      width='34'
      height='20'
      viewBox='0 0 34 20'
      xmlns='http://www.w3.org/2000/svg'
    >
      <defs>
        <filter
          x='-35.4%'
          y='-65%'
          width='170.8%'
          height='270%'
          filterUnits='objectBoundingBox'
          id='a'
        >
          <feOffset dy='2' in='SourceAlpha' result='shadowOffsetOuter1' />
          <feGaussianBlur
            stdDeviation='2.5'
            in='shadowOffsetOuter1'
            result='shadowBlurOuter1'
          />
          <feColorMatrix
            values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0'
            in='shadowBlurOuter1'
            result='shadowMatrixOuter1'
          />
          <feMerge>
            <feMergeNode in='shadowMatrixOuter1' />
            <feMergeNode in='SourceGraphic' />
          </feMerge>
        </filter>
      </defs>
      <g
        filter='url(#a)'
        transform='translate(5 3)'
        fillRule='nonzero'
        fill={color}
      >
        <path d={d} />
      </g>
    </svg>
  )
}

class ExpandContract extends Component {
  state = {
    expanded: false
  }

  _handleClick = () => {
    this.setState(prevState => ({
      expanded: !prevState.expanded
    }))
  }

  render () {
    const { color = 'white', ...props } = this.props
    const { expanded } = this.state
    const data = {
      d: expanded
        ? 'M9 8h6V2H9v6zM7 0h10v10H7V0zM24 1.5022L22.61382 0 18 5l4.61382 5L24 8.4978 20.77237 5M0 1.5022L1.38618 0 6 5l-4.61382 5L0 8.4978 3.22763 5'
        : 'M9 8h6V2H9v6zM7 0h10v10H7V0zM18 1.5022L19.38618 0 24 5l-4.61382 5L18 8.4978 21.22763 5M6 1.5022L4.61382 0 0 5l4.61382 5L6 8.4978 2.77237 5'
    }
    return (
      <Animate data={data} duration={300}>
        {data => {
          return (
            <Container onClick={this._handleClick} {...props}>
              <ExpandContractSVG d={data.d} color={color} />
            </Container>
          )
        }}
      </Animate>
    )
  }
}

export default ExpandContract
