import React, { PureComponent } from 'react'
import { Animate } from 'react-move'

class Edit extends PureComponent {
  shouldComponentUpdate (nextProps) {
    return (
      this.props.hovered !== nextProps.hovered ||
      this.props.editing !== nextProps.editing ||
      this.props.pickingColorStop !== nextProps.pickingColorStop
    )
  }
  // 'M0 2h20v2H0V2zm0 12h20v2H0v-2zm0-6h20v2H0V8z'
  render () {
    const {
      hovered = true,
      color = '#afafaf',
      editing,
      pickingColorStop,
      animationDuration = 2000,
      ...props
    } = this.props

    return (
      <Animate
        duration={animationDuration}
        data={{
          hoveredOpacity: hovered ? 0 : 1,
          d12: editing ? 'M0 2h20v2H0V2z' : 'M0 14h20v2H0V2z',
          d12x: editing ? 1 : 0,
          d12y: editing ? 14 : 0,
          d2x: editing ? 5 : 0,
          rotation: editing ? 45 : 0,
          a1x: editing ? 9 : 5,
          a1y: editing ? 9 : 3,
          b1yc1x: editing ? 9 : 15,
          r: editing ? 0 : 2
        }}
      >
        {data => {
          return (
            <svg
              {...props}
              width='20'
              height='18'
              viewBox='0 0 20 18'
              xmlns='http://www.w3.org/2000/svg'
              xmlnsXlink='http://www.w3.org/1999/xlink'
            >
              <defs>
                <circle id='a1' cx={data.a1x} cy={data.a1y} r={data.r} />
                <circle id='b1' cx='9' cy={data.b1yc1x} r={data.r} />
                <circle id='c1' cx={data.b1yc1x} cy='9' r={data.r} />
              </defs>
              <g fill='none' fillRule='evenodd'>
                <path
                  d='M0 2h20v2H0V2z'
                  fill={color}
                  transform={`translate(${data.d2x}) rotate(${data.rotation})`}
                />
                {!editing && <path d='M0 8h20v2H0V2z' fill={color} />}
                <path
                  d={data.d12}
                  fill={color}
                  transform={`translate(${data.d12x}, ${data.d12y}) rotate(-${data.rotation})`}
                />

                <g>
                  {!editing &&
                    <use
                      fill='#fff'
                      xlinkHref='#a1'
                      fillOpacity={data.hoveredOpacity}
                    />}
                  <circle
                    stroke={color}
                    strokeWidth='2'
                    cx={data.a1x}
                    cy={data.a1y}
                    r={data.r}
                  />
                  {!editing &&
                    <use
                      fill='#fff'
                      xlinkHref='#b1'
                      fillOpacity={data.hoveredOpacity}
                    />}
                  <circle
                    stroke={color}
                    strokeWidth='2'
                    cx='9'
                    cy={data.b1yc1x}
                    r={data.r}
                  />
                  {!editing &&
                    <use
                      fill='#fff'
                      xlinkHref='#c1'
                      fillOpacity={data.hoveredOpacity}
                    />}
                  <circle
                    stroke={color}
                    strokeWidth='2'
                    cx={data.b1yc1x}
                    cy='9'
                    r={data.r}
                  />
                </g>
              </g>
            </svg>
          )
        }}
      </Animate>
    )
  }
}

export default Edit
