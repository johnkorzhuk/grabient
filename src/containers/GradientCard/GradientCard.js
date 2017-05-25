import React, { Component } from 'react'
import { connect } from 'react-redux'
import styled from 'styled-components'

import { toggleEditing } from './../../store/gradients/actions'

import { getGradientById } from './../../store/gradients/selectors'
import { getStopsById } from './../../store/stops/selectors'

import { AnglePreview, GradientContainer } from './../../components/index'
import { AddColor } from './../../components/Icons/index'
import { SortableSwatch } from './../index'

// units = ms
const GRADIENT_ANIMATION_DURATION = 500
const ANGLE_WHEEL_ANIMATION_DURATION = 300
const ANGLE_PREVIEW_ANIMATION_DURATION = 200
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

class GradientCard extends Component {
  state = {
    hovered: {
      arrowPrev: false,
      addColor: false,
      main: false
    },
    wasEditing: false,
    sliderContainer: null
  }

  componentDidMount () {
    this.setState({
      sliderContainer: this.sliderContainer.getClientRects()[0]
    })
  }

  componentWillReceiveProps (nextProps) {
    const { editingAngle } = this.props
    if (editingAngle !== nextProps.editingAngle) {
      this.setState({ wasEditing: !nextProps.editingAngle })
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

  render () {
    const {
      hovered: { arrowPrev, addColor, main },
      sliderContainer
    } = this.state
    const {
      id,
      toggleEditing,
      angle,
      editingAngle,
      editingStop,
      index,
      stopData
    } = this.props

    return (
      <Container
        style={{
          order: index
        }}
      >
        <GradientContainer
          stopData={stopData}
          angle={angle}
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
            onClick={() => toggleEditing(id)}
            onMouseEnter={e => this._handleMouseEnter(e, 'arrowPrev')}
            onMouseLeave={e => this._handleMouseLeave(e, 'arrowPrev')}
          >
            <AnglePreview
              editingAngle={editingAngle}
              editingStop={editingStop}
              angle={angle}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              hovered={arrowPrev}
            >

              <AngleText>{angle}°</AngleText>
            </AnglePreview>
          </AngleContainer>

          <SwatchSliderContainer
            innerRef={node => (this.sliderContainer = node)}
          >

            <SortableSwatch
              containerDimenions={sliderContainer}
              id={id}
              transitionDuration={SLIDER_ANIMATION_DURATION}
            />
          </SwatchSliderContainer>

          <AddColorContainer
            onMouseEnter={e => this._handleMouseEnter(e, 'addColor')}
            onMouseLeave={e => this._handleMouseLeave(e, 'addColor')}
          >
            <AddColor
              anmationDuration={SLIDER_ANIMATION_DURATION}
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
    editingAngle: id == state.gradients.editingAngle.id,
    // eslint-disable-next-line eqeqeq
    editingStop: id == state.stops.editing,
    // eslint-disable-next-line eqeqeq
    angle: id == state.gradients.editingAngle.id
      ? state.gradients.editingAngle.angle === null
          ? gradient.angle
          : state.gradients.editingAngle.angle
      : gradient.angle
  }
}

export default connect(mapStateToProps, {
  toggleEditing
})(GradientCard)
