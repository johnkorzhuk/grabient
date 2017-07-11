import React, { Component } from 'react';
import { connect } from 'react-redux';
import styled from 'styled-components';
import debounce from 'lodash/debounce';

import { toggleEditing, updateEditingAngle, resetGradientAngle } from './../../store/gradients/actions';
import {
  editStop,
  updateActiveColorPicker,
  addColorStop,
  editStopColor,
  resetColorStop,
  STOP_LIMIT,
  deleteActiveStop
} from './../../store/stops/actions';
import { updateSwatchDimensions } from './../../store/dimensions/actions';
import { copyCSS } from './../../store/icons/actions';
import { getGradientById } from './../../store/gradients/selectors';
import { getStopsById } from './../../store/stops/selectors';

import { AnglePreview, GradientContainer, AddDeleteStop } from './../../components/index';
import { Edit } from './../../components/Icons/index';
import { SortableSwatch } from './../index';
import { Button } from './../../components/Common/index';

// units = ms
const GRADIENT_ANIMATION_DURATION = 500;
const ANGLE_WHEEL_ANIMATION_DURATION = 300;
const ANGLE_PREVIEW_ANIMATION_DURATION = 200;
// also used for icon opacity transition duration
const SLIDER_ANIMATION_DURATION = 300;

const ICON_COLOR = '#afafaf';

const getOrder = (index, columns) => {
  if (index % columns === 0) return index;
  if (index % columns === 1) return index - 2;
  if (index % columns === 2) return index - 3;
  return index;
};

const Container = styled.li`
  width: 85%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 20px 30px;
  position: relative;
  transition: width 400ms linear;

  @media (min-width: 420px) {
    width: 100%;
  }
`;

const GradientItem = Container.extend`
  z-index: ${({ editing }) => (editing ? 21 : 'auto')};
  @media (min-width: 680px) {
    width: ${({ expanded }) => (expanded ? '100%' : '50%')};
    order: ${({ index, expanded }) => (expanded ? getOrder(index, 2) : index)};
  }

  @media (min-width: 970px) {
    width: ${({ expanded }) => (expanded ? '100%' : '33.33%')};
    order: ${({ index, expanded }) => (expanded ? getOrder(index, 3) : index)};
  }
`;

const AngleContainer = Button.extend`
  margin-right: auto;
  position: absolute;
  height: 40px;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  z-index: 10;
`;

const InfoContainer = styled.div`
  z-index: ${({ editing }) => (editing ? 22 : 'auto')};
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  margin-top: 15px;
`;

const SwatchSliderContainer = styled.div`
  position: relative;
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 40px;
  margin-right: 7rem;
  margin-left: 1rem;
`;

const AddDeleteButtonContainer = Button.extend`
  position: absolute;
  right: 25px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 25px;
  cursor: ${({ atStopLimit }) => (atStopLimit ? 'not-allowed' : 'pointer')};
`;

const EditExitButtonContainer = Button.extend`
  position: absolute;
  right: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 25px;
`;

const addEvent = function(object, type, callback) {
  if (object == null || typeof object === 'undefined') return;
  if (object.addEventListener) {
    object.addEventListener(type, debounce(callback, 100), false);
  } else if (object.attachEvent) {
    object.attachEvent('on' + type, debounce(callback, 100));
  } else {
    object['on' + type] = debounce(callback, 100);
  }
};

class GradientCard extends Component {
  state = {
    hovered: {
      arrowPrev: false,
      addColor: false,
      main: false,
      reset: false,
      copy: false,
      edit: false
    },
    wasEditing: false
  };

  componentDidMount() {
    addEvent(window, 'resize', this._handleWindowResize);
  }

  shouldComponentUpdate(nextProps, nextState) {
    const willEdit = this.props.id === nextProps.editingAngleData.id || nextProps.editingStop || nextProps.editingColor;
    if (!willEdit) return true;
    else if (willEdit || this.state !== nextState) return true;
    return false;
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._handleWindowResize);
  }

  componentWillReceiveProps(nextProps) {
    const { editingAngle, editingStop, updateSwatchDimensions } = this.props;
    if (editingAngle !== nextProps.editingAngle) {
      this.setState({ wasEditing: !nextProps.editingAngle });
    }

    if (editingStop !== nextProps.editingStop) {
      updateSwatchDimensions(this.sliderContainer.getClientRects());
    }
  }

  _handleWindowResize = e => {
    if (this.props.editingStop) {
      this.props.updateSwatchDimensions(this.sliderContainer.getClientRects());
    }
  };

  _handleMouseEnter = (e, items) => {
    if (!this.state.wasEditing) {
      this.setItemHoveredState(items, true, false);
    }
  };

  _handleMouseLeave = (e, items) => {
    this.setItemHoveredState(items, false, true);
  };

  _handleAddCancelColorStop = () => {
    const { editingStop, editStop, updateActiveColorPicker, id, pickingColorStop, editStopColor } = this.props;
    if (pickingColorStop) {
      editStopColor(null);
      return updateActiveColorPicker(null);
    }

    if (editingStop) {
      editStop(null);
    } else if (!pickingColorStop) {
      editStop(id);
    }
  };

  _handleLeftIconClick = () => {
    const { toggleEditing, updateEditingAngle, id, angle } = this.props;
    toggleEditing(id);
    updateEditingAngle(angle);
  };

  _handleAddColor = () => {
    const { id, addColorStop } = this.props;
    addColorStop(id);
  };

  _handleDelete = () => {
    const { hovered: addColor } = this.state;
    const { deleteActiveStop, renderDelete, id } = this.props;
    if (addColor && renderDelete) deleteActiveStop(id);
  };

  setItemHoveredState(items, hovered, resetWasEditing) {
    const newState = { ...this.state };
    items.forEach(item => {
      newState.hovered[item] = hovered;
    });

    if (resetWasEditing) newState.wasEditing = false;

    this.setState(newState);
  }

  render() {
    const { hovered: { arrowPrev, addColor, main, edit, copy, reset } } = this.state;
    const {
      id,
      angle,
      editingAngleData,
      editingStop,
      index,
      stopData,
      pickingColorStop,
      expanded,
      editingColor,
      renderDelete,
      copyCSS,
      style,
      copiedId,
      edited,
      resetGradientAngle,
      resetColorStop
    } = this.props;
    const atStopLimit = Object.keys(stopData).length >= STOP_LIMIT - 1;
    const editingAngle = id === editingAngleData.id;
    const editing = editingStop || editingAngle || editingColor;
    const actualAngle = editingAngle ? editingAngleData.angle : angle;

    return (
      <GradientItem index={index} expanded={expanded} editing={editingAngle} style={style}>
        <GradientContainer
          resetColorStop={resetColorStop}
          resetGradientAngle={resetGradientAngle}
          onCopyCSS={copyCSS}
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
          editingColor={editingColor}
          pickingColorStop={pickingColorStop}
          copiedId={copiedId}
          edited={edited}
          copyHovered={copy}
          resetHovered={reset}
        />

        <InfoContainer editing={editing}>
          <AngleContainer
            title="Edit Angle"
            onClick={this._handleLeftIconClick}
            onMouseEnter={e => this._handleMouseEnter(e, ['arrowPrev'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['arrowPrev'])}
          >
            <AnglePreview
              editingAngle={editingAngle}
              editingStop={editingStop}
              angle={actualAngle}
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              iconAnimationDuration={SLIDER_ANIMATION_DURATION}
              hovered={arrowPrev}
              color={ICON_COLOR}
            />
          </AngleContainer>

          <SwatchSliderContainer
            innerRef={node => {
              this.sliderContainer = node;
            }}
          >
            <SortableSwatch id={id} deleteStop={addColor} animationDuration={SLIDER_ANIMATION_DURATION} />
          </SwatchSliderContainer>

          <AddDeleteButtonContainer
            title={renderDelete ? 'Delete' : 'Add'}
            onMouseEnter={e => this._handleMouseEnter(e, ['addColor'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['addColor'])}
            onMouseUp={this._handleDelete}
            onClick={this._handleAddColor}
            atStopLimit={atStopLimit && !renderDelete}
          >
            <AddDeleteStop
              animationDuration={ANGLE_PREVIEW_ANIMATION_DURATION}
              hovered={(!atStopLimit && addColor) || (renderDelete && addColor)}
              color={!atStopLimit || renderDelete ? ICON_COLOR : '#e1e1e1'}
              renderDelete={renderDelete}
            />
          </AddDeleteButtonContainer>

          <EditExitButtonContainer
            title={editingStop || editingColor ? 'Exit' : 'Edit'}
            onMouseEnter={e => this._handleMouseEnter(e, ['edit'])}
            onMouseLeave={e => this._handleMouseLeave(e, ['edit'])}
            onClick={this._handleAddCancelColorStop}
          >
            <Edit
              id={id}
              pickingColorStop={pickingColorStop}
              editing={editingStop || editingColor}
              animationDuration={SLIDER_ANIMATION_DURATION}
              hovered={edit}
              color={ICON_COLOR}
            />
          </EditExitButtonContainer>
        </InfoContainer>
      </GradientItem>
    );
  }
}

const mapStateToProps = (state, props) => {
  const gradient = getGradientById(props.id)(state);
  const editingStop = props.id === state.stops.editing;
  const stopData = getStopsById(state, props);
  return {
    stopData,
    draggingItemMousePos: state.stops.draggingItemMousePos,
    editingAngleData: state.gradients.editingAngle,
    editingStop,
    angle: gradient.angle,
    pickingColorStop: state.stops.updating.pickingColorStop !== null,
    editingColor: props.id === state.stops.editingColor,
    expanded: state.gradients.expanded === props.id,
    renderDelete: state.icons.deleteStop === props.id && Object.keys(stopData).length > 2,
    copiedId: state.icons.copied,
    edited: gradient.edited
  };
};

export default connect(mapStateToProps, {
  toggleEditing,
  editStop,
  editStopColor,
  updateEditingAngle,
  updateSwatchDimensions,
  updateActiveColorPicker,
  addColorStop,
  copyCSS,
  resetGradientAngle,
  resetColorStop,
  deleteActiveStop
})(GradientCard);
