import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'
import { connect } from 'inferno-redux'

import { AngleArrow } from './../../components/index'

import { updateGradientAngle } from './../../store/gradients/actions'

const AreaContainer = styled.div`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1;
`

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  z-index: 13;
`

const AngleRef = styled.div`
  position: absolute;
  height: 2px;
  width: 2px;
`

const AngleBox = styled.div`
  filter: ${({ hovered }) => `blur(${hovered ? '1px' : '3px'})`};
  position: absolute;
  border-radius: 50%;
`

const TextContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
`

const TextValue = styled.input`
  color: black;
  font-size: 1.4rem;
  cursor: default;
  text-align: center;
  border: none;
  background: none;
  display: block;
  z-index: 40;

  &::-webkit-inner-spin-button,
  ::-webkit-outer-spin-button {
    -webkit-appearance: none; 
    margin: 0; 
  }

  &:focus {
    outline: none;
  }
`

const Deg = styled.span`
  color: black;
  font-size: 1.4rem;
  z-index: 1;
  display: block;
`

class ArrowContainer extends Component {
  state = {
    hovered: false,
    arrowClicked: false,
    angle: this.props.angle,
    updatingText: false
  }

  arrowClickedContainerWidth = 400
  arrowClickedContainerOffset = -145

  _handleMouseLeave = () => {
    console.log('_handleMouseLeave')
    this.updateAngle()
    this.setState(() => ({
      hovered: false,
      arrowClicked: false,
      updatingText: false
    }))
  }

  _handleMouseDown = e => {
    console.log('_handleMouseDown')
    if (this.state.hovered) {
      this.setState(() => ({ arrowClicked: true, updatingText: false }))
    }
  }

  _handleMouseUp = () => {
    console.log('_handleMouseUp')
    this.updateAngle()
    if (this.state.hovered) {
      this.setState(() => ({ updatingText: true }))
    }

    if (this.input) {
      this.input.focus()
    }
  }

  _handleMouseMove = e => {
    console.log('_handleMouseMove')
    const { arrowClicked, updatingText } = this.state
    if (arrowClicked && !updatingText) {
      const angle = this.checkCommonAngles(this.getAngle(e.offsetX, e.offsetY))
      this.setState({
        angle
      })
    }
  }

  _handleArrowClick = () => {
    console.log('_handleArrowClick')
    this.setState(() => ({ hovered: true, arrowClicked: true }))
  }

  _handleKeyEnter = e => {
    if (e.which === 13) {
      const { angle } = this.props
      this.updateAngle()
      this.setState(prevState => ({
        hovered: false,
        arrowClicked: false,
        angle: prevState.angle || angle
      }))
    }
  }

  _handleInputChange = e => {
    let angle = parseInt(e.target.value, 10)
    if (!isNaN(angle)) {
      if (angle > 359) angle -= 360
      if (angle < 0) angle += 360
      this._handleInputChange.lastValid = angle
      this.setState({
        angle
      })
    } else if (e.target.value === '') {
      this.setState({
        angle: ''
      })
    } else {
      this.setState({
        angle: this._handleInputChange.lastValid || this.props.angle
      })
    }
  }

  updateAngle () {
    const { angle, hovered } = this.state
    const { updateGradientAngle, id } = this.props
    if (hovered) {
      const newAngle = isNaN(angle) ? this.props.angle : angle
      updateGradientAngle(id, newAngle)
    }
  }

  checkCommonAngles (angle) {
    if (angle <= 10) return 0
    else if (angle >= 35 && angle <= 55) return 45
    else if (angle >= 80 && angle <= 100) return 90
    else if (angle >= 125 && angle <= 145) return 135
    else if (angle >= 170 && angle <= 190) return 180
    else if (angle >= 215 && angle <= 235) return 225
    else if (angle >= 260 && angle <= 280) return 270
    else if (angle >= 305 && angle <= 325) return 315
    else if (angle >= 350) return 0
    return angle
  }

  getAngle (pageX, pageY) {
    if (!this.getAngle.boxCenter) {
      this.getAngle.boxCenter = this.getBoxCenter()
    }
    let angle =
      Math.atan2(
        pageX - this.getAngle.boxCenter[0],
        -(pageY - this.getAngle.boxCenter[1])
      ) *
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

  getWidth (angle) {
    const length = angle.toString().length

    if (length === 2) return 20
    else if (length === 3) return 27
    else return 11
  }

  render () {
    const { transitionDuration } = this.props
    const { hovered, arrowClicked, angle } = this.state
    return (
      <Animate
        data={{
          containerWidth: hovered ? 110 : 30,
          containerOffset: hovered ? 0 : 20,
          boxOpacity: hovered ? 1 : 0.3,
          boxWidth: hovered ? 75 : 30,
          boxColor: hovered ? '#f1f1f1' : 'white',
          arrowTranslateX: hovered ? -22 : 8,
          arrowOpacity: hovered ? 1 : 0.6,
          textOpacity: hovered ? 1 : 0
        }}
        duration={transitionDuration}
      >
        {data => (
          <AreaContainer
            onMouseLeave={this._handleMouseLeave}
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
            <Container
              onMouseDown={this._handleMouseDown}
              onMouseUp={this._handleMouseUp}
              onMouseMove={this._handleMouseMove}
              innerRef={node => {
                this.container = node
              }}
            />
            <AngleRef
              innerRef={node => {
                this.box = node
              }}
            />
            <AngleBox
              hovered={hovered}
              style={{
                backgroundColor: data.boxColor,
                width: data.boxWidth,
                height: data.boxWidth,
                opacity: data.boxOpacity
              }}
            />
            <TextContainer
              style={{
                opacity: hovered ? data.textOpacity : 0
              }}
            >
              <Deg>°</Deg>
              <TextValue
                onFocus={e => e.target.select()}
                onKeyDown={this._handleKeyEnter}
                innerRef={node => {
                  this.input = node
                }}
                type='number'
                value={angle}
                onChange={this._handleInputChange}
                style={{
                  width: this.getWidth(angle)
                }}
              />

            </TextContainer>

            <AngleArrow
              onClick={this._handleArrowClick}
              clicked={arrowClicked}
              angle={angle}
              styles={{
                position: 'absolute',
                right: '50%',
                fillOpacity: data.arrowOpacity
              }}
              translateX={data.arrowTranslateX}
              transitionDuration={transitionDuration}
            />
          </AreaContainer>
        )}
      </Animate>
    )
  }
}

export default connect(undefined, { updateGradientAngle })(ArrowContainer)
