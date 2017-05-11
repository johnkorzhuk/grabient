import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'
import { connect } from 'inferno-redux'
import debounce from 'lodash.debounce'

import { AngleArrow } from './../../components/index'

import { updateGradientAngle } from './../../store/gradients/actions'

const Container = styled.div`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
`

const ArrowBox = styled.div`
  position: absolute;
  border-radius: 50%;
  filter: ${({ hovered }) => `blur(${hovered ? '1px' : '3px'})`};
`

const Text = styled.input`
  color: black;
  font-size: 1.4rem;
  z-index: 1;
  cursor: default;
`

class ArrowContainer extends Component {
  state = {
    hovered: false,
    arrowClicked: false
  }

  arrowClickedContainerWidth = 400
  arrowClickedContainerOffset = -145

  _handleMouseEnter = () => {
    this.setState(() => ({ hovered: true }))
  }

  _handleMouseLeave = () => {
    this.setState(() => ({ hovered: false, arrowClicked: false }))
  }

  _handleMouseDown = e => {
    this.setState(() => ({ arrowClicked: true }))
  }

  _handleMouseUp = () => {
    this.setState(() => ({ arrowClicked: false }))
  }

  _handleMouseMove = e => {
    if (this.state.arrowClicked) {
      const { updateGradientAngle, id } = this.props
      const angle = this.getAngle(e.offsetX, e.offsetY)
      updateGradientAngle(id, angle)
    }
  }

  getAngle (pageX, pageY) {
    const boxCenter = this.getBoxCenter()
    let angle =
      Math.atan2(pageX - boxCenter[0], -(pageY - boxCenter[1])) *
      (180 / Math.PI)

    if (angle < 0) angle += 360

    return Math.round(angle)
  }

  getBoxCenter () {
    return [
      this.box.offsetLeft + this.box.offsetWidth / 2,
      this.box.offsetTop + this.box.offsetHeight / 2
    ]
  }

  render () {
    const { angle, transitionDuration } = this.props
    const { hovered, arrowClicked } = this.state

    return (
      <Animate
        data={{
          containerWidth: hovered ? 110 : 30,
          containerOffset: hovered ? 0 : 20,
          boxOpacity: hovered ? 1 : 0.3,
          boxWidth: hovered ? 80 : 30,
          boxColor: hovered ? '#f1f1f1' : 'white',
          arrowTranslateX: hovered ? -22 : 8,
          arrowOpacity: hovered ? 1 : 0.6,
          textOpacity: hovered ? 1 : 0
        }}
        duration={transitionDuration}
      >
        {data => (
          <Container
            onMouseEnter={this._handleMouseEnter}
            onMouseLeave={this._handleMouseLeave}
            onMouseDown={this._handleMouseDown}
            onMouseMove={debounce(this._handleMouseMove, 100)}
            onMouseUp={this._handleMouseUp}
            style={{
              width: arrowClicked
                ? this.arrowClickedContainerWidth
                : data.containerWidth,
              height: arrowClicked
                ? this.arrowClickedContainerWidth
                : data.containerWidth,
              bottom: arrowClicked
                ? this.arrowClickedContainerOffset
                : data.containerOffset,
              left: arrowClicked
                ? this.arrowClickedContainerOffset
                : data.containerOffset
            }}
          >
            <Text
              type='number'
              value={angle}
              onChange={e =>
                this.props.updateGradientAngle(this.props.id, e.target.value)}
              style={{
                opacity: hovered ? data.textOpacity : 0
              }}
            >
              {angle}deg
            </Text>
            <ArrowBox
              innerRef={node => {
                this.box = node
              }}
              hovered={hovered}
              style={{
                backgroundColor: data.boxColor,
                width: data.boxWidth,
                height: data.boxWidth,
                opacity: data.boxOpacity
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

export default connect(undefined, { updateGradientAngle })(ArrowContainer)
