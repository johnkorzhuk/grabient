import React from 'react'

const Expand = ({ color }) => {
  return (
    <svg
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
          <feoffset dy='2' in='SourceAlpha' result='shadowOffsetOuter1'>
            <fegaussianblur
              stdDeviation='2.5'
              in='shadowOffsetOuter1'
              result='shadowBlurOuter1'
            >
              <fecolormatrix
                values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0'
                in='shadowBlurOuter1'
                result='shadowMatrixOuter1'
              >
                <femerge>
                  <femergenode in='shadowMatrixOuter1'>
                    <femergenode in='SourceGraphic' />
                  </femergenode>
                </femerge>
              </fecolormatrix>
            </fegaussianblur>
          </feoffset>
        </filter>
      </defs>
      <path
        d='M9 8h6V2H9v6zM7 0h10v10H7V0zM24 1.5022L22.61382 0 18 5l4.61382 5L24 8.4978 20.77237 5M0 1.5022L1.38618 0 6 5l-4.61382 5L0 8.4978 3.22763 5'
        filter='url(#a)'
        transform='translate(5 3)'
        fill='#FFF'
      />
    </svg>
  )
}

export default Expand
