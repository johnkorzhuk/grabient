import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import {
  toggleEditing,
  updateEditingAngle
} from './../../store/gradients/actions'
import { editStop } from './../../store/stops/actions'
import { getGradientById } from './../../store/gradients/selectors'
import { getStopsById } from './../../store/stops/selectors'
import { updateSwatchDimensions } from './../../store/dimensions/actions'
import { AnglePreview, GradientContainer } from './../../components/index'
import { AddColor } from './../../components/Icons/index'
import { SortableSwatch } from './../index'

// units = ms
const GRADIENT_ANIMATION_DURATION = 500
const ANGLE_WHEEL_ANIMATION_DURATION = 300
const ANGLE_PREVIEW_ANIMATION_DURATION = 200
// also used for icon opacity transition duration
const SLIDER_ANIMATION_DURATION = 200

const Container = styled.div`
  width: 33.33%;
  height: 35vw;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 30px 3% 10px;
  position: relative;
`

const AngleContainer = styled.div`
  margin-right: auto;
  position: absolute;
  cursor: pointer;
  height: 40px;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  z-index: 10;
`

const AngleText = styled.span`
  font-size: 1.6rem;
  color: #AFAFAF;
  padding-left: 10px;
  position: absolute;
  top: 2px;
`

const InfoContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  z-index: 10;
  bottom: 15px;
`

const SwatchSliderContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 40px;
  margin: 0 4rem 0 1rem;
`

const AddColorContainer = styled.div`
  position: absolute;
  right: 0;
  height: 40px;
  width: 25px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`

// todo slider container's dimnestions needs to be regrabbed on resize / width change

class GradientCard extends Component {
  state = {
    hovered: {
      arrowPrev: false,
      addColor: false,
      main: false
    },
    wasEditing: false
  }

  componentWillReceiveProps (nextProps) {
    const { editingAngle, editingStop } = this.props
    if (editingAngle !== nextProps.editingAngle) {
      this.setState({ wasEditing: !nextProps.editingAngle })
    }

    if (editingStop !== nextProps.editingStop) {
      if (nextProps.editingStop) {
        this.props.updateSwatchDimensions(this.sliderContainer.getClientRects())
      } else {
        this.props.updateSwatchDimensions(null, true)
      }
    }
  }

  _handleMouseEnter = (e, el) => {
    if (!this.state.wasEditing) {
      const newState = { ...this.state }
      newState.hovered[el] = true
      this.setState(newState)
    }
  }

  _handleMouseLeave = (e, el) => {
    const newState = { ...this.state }
    newState.hovered[el] = false
    newState.wasEditing = false

    this.setState(newState)
  }

  _handleAddCancelColorStop = () => {
    const { editingStop, editStop } = this.props

    if (editingStop) {
      editStop(null)
    }
  }

  _handleAngleEditToggle = () => {
    const { toggleEditing, updateEditingAngle, id, angle } = this.props

    toggleEditing(id)
    updateEditingAngle(angle)
  }

  render () {
    const { hovered: { arrowPrev, addColor, main } } = this.state
    const {
      id,
      angle,
      editingAngleData,
      editingStop,
      index,
      stopData
    } = this.props
    const editingAngle = id === editingAngleData.id
    const actualAngle = editingAngle ? editingAngleData.angle : angle

    return (
      <Container
        style={{
          order: index
        }}
      >
        <GradientContainer
          stopData={stopData}
          actualAngle={actualAngle}
          onMouseEnter={this._handleMouseEnter}
          onMouseLeave={this._handleMouseLeave}
          gradientAnimationDuration={GRADIENT_ANIMATION_DURATION}
          wheelAnimationDuration={ANGLE_WHEEL_ANIMATION_DURATION}
          id={id}
          hovered={main}
          editingAngle={editingAngle}
          editingStop={editingStop}
        />

        <InfoContainer>

          <AngleContainer
            onClick={this._handleAngleEditToggle}
            onMouseEnter={e => this._handleMouseEnter(e, 'arrowPrev')}
            onMouseLeave={e => this._handleMouseLeave(e, 'arrowPrev')}
          >
            <AnglePreview
              editingAngle={editingAngle}
              editingStop={editingStop}
              angle={actualAngle}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              iconAnimationDuration={SLIDER_ANIMATION_DURATION}
              hovered={arrowPrev}
            >
              <AngleText>{angle}°</AngleText>
            </AnglePreview>
          </AngleContainer>

          <SwatchSliderContainer
            innerRef={node => {
              this.sliderContainer = node
            }}
          >
            <SortableSwatch
              id={id}
              transitionDuration={SLIDER_ANIMATION_DURATION}
            />
          </SwatchSliderContainer>

          <AddColorContainer
            onMouseEnter={e => this._handleMouseEnter(e, 'addColor')}
            onMouseLeave={e => this._handleMouseLeave(e, 'addColor')}
            onClick={this._handleAddCancelColorStop}
          >
            <AddColor
              editingStop={editingStop}
              animationDuration={SLIDER_ANIMATION_DURATION}
              hovered={addColor}
              color='#AFAFAF'
            />
          </AddColorContainer>
        </InfoContainer>
      </Container>
    )
  }
}

const mapStateToProps = (state, { id }) => {
  const gradient = getGradientById(id)(state)

  return {
    stopData: getStopsById(state, id),
    draggingItemMousePos: state.stops.draggingItemMousePos,
    // eslint-disable-next-line eqeqeq
    editingAngleData: state.gradients.editingAngle,
    // eslint-disable-next-line eqeqeq
    editingStop: id == state.stops.editing,
    // eslint-disable-next-line eqeqeq
    angle: gradient.angle
  }
}

export default connect(mapStateToProps, {
  toggleEditing,
  editStop,
  updateEditingAngle,
  updateSwatchDimensions
})(GradientCard)
