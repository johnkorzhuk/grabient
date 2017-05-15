import Component from 'inferno-component'
import styled from 'styled-components'
import { Animate } from 'react-move'
import { connect } from 'inferno-redux'

import { AngleArrow } from './../../components/index'

import { updateGradientAngle } from './../../store/gradients/actions'

const Z_INDEXES = {
  AreaContainer: 1,
  Container: 13,
  TextValue: 40,
  AngleArrow: [1, 15]
}

const AreaContainer = styled.div`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
`

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
`

const AngleRef = styled.div`
  position: absolute;
  height: 2px;
  width: 2px;
`

const AngleBox = styled.div`
  filter: ${({ active }) => `blur(${active ? '1px' : '3px'})`};
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
  display: block;
`

class ArrowContainer extends Component {
  state = {
    active: false,
    cursorUpdatingAngle: false,
    updatingText: false,
    angle: this.props.angle
  }

  shouldComponentUpdate (nextProps, nextState) {
    if (this.state.angle !== nextState.angle) return true
    if (this.state.cursorUpdatingAngle !== nextState.cursorUpdatingAngle) {
      return true
    }
    if (this.state.active !== nextState.active) {
      return true
    }
    return false
  }

  _handleMouseLeave = () => {
    // this.updateAngle()
    // this.setState(() => ({
    //   active: false,
    //   cursorUpdatingAngle: false,
    //   updatingText: false
    // }))
  }

  _handleMouseMove = e => {
    const { cursorUpdatingAngle, updatingText } = this.state
    if (cursorUpdatingAngle && !updatingText) {
      const angle = this.checkCommonAngles(this.getAngle(e.offsetX, e.offsetY))
      this.setState({
        angle
      })
    }
  }

  _handleKeyEnter = e => {
    if (e.which === 13) {
      const { angle } = this.props
      this.updateAngle()
      this.setState(prevState => ({
        active: false,
        cursorUpdatingAngle: false,
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

  _handleInputClick = () => {
    this.setState(() => ({ cursorUpdatingAngle: false }))
  }

  _handleClick = e => {
    const { active, cursorUpdatingAngle } = this.state
    if (active) {
      if (cursorUpdatingAngle) {
        this.updateAngle()
        this.setState(() => ({
          active: false,
          cursorUpdatingAngle: false,
          updatingText: false
        }))
      }
    } else {
      this.setState(() => ({ active: true }))

      if (this.input) {
        this.input.focus()
      }
    }
  }

  _handleArrowClick = () => {
    this.setState(() => ({ cursorUpdatingAngle: true }))
  }

  updateAngle () {
    const { angle, active } = this.state
    const { updateGradientAngle, id } = this.props
    if (active) {
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

  getAngle (offsetX, offsetY) {
    if (!this.getAngle.boxCenter) {
      this.getAngle.boxCenter = this.getBoxCenter()
    }
    let angle =
      Math.atan2(
        offsetX - this.getAngle.boxCenter[0],
        -(offsetY - this.getAngle.boxCenter[1])
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
    else if (length === 3) return 30
    else return 11
  }

  render () {
    const { transitionDuration } = this.props
    const { active, cursorUpdatingAngle, angle } = this.state
    return (
      <Animate
        data={{
          containerWidth: active ? 110 : 30,
          containerOffset: active ? 0 : 20,
          boxOpacity: active ? 1 : 0.3,
          boxWidth: active ? 75 : 30,
          boxColor: active ? '#f1f1f1' : 'white',
          arrowTranslateX: active ? -22 : 8,
          arrowOpacity: active ? 1 : 0.6,
          textOpacity: active ? 1 : 0
        }}
        duration={transitionDuration}
      >
        {data => (
          <AreaContainer
            onMouseLeave={this._handleMouseLeave}
            style={{
              width: cursorUpdatingAngle ? 400 : data.containerWidth,
              height: cursorUpdatingAngle ? 400 : data.containerWidth,
              bottom: cursorUpdatingAngle ? -145 : data.containerOffset,
              left: cursorUpdatingAngle ? -145 : data.containerOffset,
              zIndex: Z_INDEXES.AreaContainer
            }}
          >
            <Container
              onClick={this._handleClick}
              onMouseMove={this._handleMouseMove}
              innerRef={node => {
                this.container = node
              }}
              style={{
                zIndex: Z_INDEXES.Container,
                cursor: active ? 'default' : 'pointer'
              }}
            />
            <AngleRef
              innerRef={node => {
                this.box = node
              }}
            />
            <AngleBox
              active={active}
              style={{
                backgroundColor: data.boxColor,
                width: data.boxWidth,
                height: data.boxWidth,
                opacity: data.boxOpacity
              }}
            />
            <TextContainer
              style={{
                opacity: active ? data.textOpacity : 0
              }}
            >
              <Deg>°</Deg>
              <TextValue
                onFocus={e =>
                  setTimeout(function () {
                    e.target.select()
                  }, transitionDuration)}
                onClick={this._handleInputClick}
                onKeyDown={this._handleKeyEnter}
                innerRef={node => {
                  this.input = node
                }}
                type='number'
                value={angle}
                onChange={this._handleInputChange}
                style={{
                  width: this.getWidth(angle),
                  zIndex: Z_INDEXES.TextValue
                }}
              />

            </TextContainer>

            <AngleArrow
              onClick={this._handleArrowClick}
              angle={angle}
              styles={{
                position: 'absolute',
                right: '50%',
                fillOpacity: data.arrowOpacity,
                zIndex: active
                  ? cursorUpdatingAngle
                      ? Z_INDEXES.AngleArrow[0]
                      : Z_INDEXES.AngleArrow[1]
                  : Z_INDEXES.AngleArrow[0]
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
