/* eslint-disable react/no-array-index-key */

import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Animate } from 'react-move';
import styled from 'styled-components';
import { SortableContainer, SortableElement, arrayMove } from 'react-sortable-hoc';

import { toggleEditing } from './../../store/gradients/actions';
import {
  editStopColor,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop,
  updateActiveColorPicker,
  updateActiveStop
} from './../../store/stops/actions';
import { toggleTrashIcon } from './../../store/icons/actions';
import { getStopsById, getStopData, getEditingState } from './../../store/stops/selectors';

import { SwatchItem, SwatchContainer } from './../../components/Swatch/index';

const SlideBar = styled.div`
  height: 2px;
  width: 100%;
  background-color: #afafaf;
`;

const SortableItem = SortableElement(props => <SwatchItem {...props} />);

const SortableList = SortableContainer(
  ({
    animationDuration,
    onSortItemClick,
    style,
    stopKeys,
    editing,
    editingColor,
    updatingValue,
    editingAngle,
    stops,
    data,
    sorting,
    pickingColorStop,
    passThreshold,
    active,
    ...props
  }) => {
    const isUpdating = updatingValue !== null;

    return (
      <Animate data={data} duration={animationDuration} ignore={isUpdating ? stopKeys : []}>
        {data =>
          <SwatchContainer
            editing={editing}
            style={{
              ...style,
              width: data.width
            }}
          >
            <SlideBar
              style={{
                opacity: data.barOpacity
              }}
            />
            {stopKeys.map((stop, index) => {
              const color = stops[stop];
              let left = data[stop];
              // bug with react-sortable-hoc
              const style = sorting
                ? {}
                : {
                    transform: 'none',
                    transitionDuration: '0ms'
                  };

              // handling bug where data[stop] = NaN best way I know how to. A transition wont happen, the stop will just jump if the bug occurs.
              // To force it to happen: spam click the stop when editing and have cursor off the stop on mouse up. Weird!
              if (isNaN(left)) {
                // eslint-disable-next-line no-unused-expressions
                editing ? (left = stop) : (left = parseFloat((index + 1) / stopKeys.length * 100, 10));
              }

              return (
                <SortableItem
                  {...props}
                  disabled={editing || pickingColorStop === stop}
                  editing={editing}
                  editingColor={editingColor}
                  stop={stop}
                  pickingColorStop={pickingColorStop}
                  style={{
                    ...style
                  }}
                  isUpdating={isUpdating}
                  key={index}
                  index={index}
                  isBeingEdited={active === stop}
                  sorting={sorting}
                  onTouchStart={e => onSortItemClick(e, stop, editing, sorting, pickingColorStop)}
                  onTouchMove={e => onSortItemClick(e, stop, editing, sorting, pickingColorStop)}
                  onTouchEnd={e => onSortItemClick(e, stop, editing, sorting, pickingColorStop)}
                  onMouseUp={e => onSortItemClick(e, stop, editing, sorting, pickingColorStop)}
                  onMouseDown={e => onSortItemClick(e, stop, editing, sorting, pickingColorStop)}
                  color={color}
                  left={left}
                  active={active}
                />
              );
            })}
          </SwatchContainer>}
      </Animate>
    );
  }
);

class Swatch extends Component {
  state = {
    sorting: false
  };

  shouldComponentUpdate(nextProps, nextState) {
    return (
      this.props.colors !== nextProps.colors ||
      this.props.data !== nextProps.data ||
      this.props.editing !== nextProps.editing ||
      this.props.draggingItemMousePos !== nextProps.draggingItemMousePos ||
      this.props.stops !== nextProps.stops ||
      this.state.sorting !== nextState.sorting
    );
  }

  componentDidUpdate(prevProps) {
    if (this.props.editing !== prevProps.editing && !this.props.editing) {
      this.props.updateUpdatingStop(null);
    }
  }

  handleSortStart = () => {
    this.setState({
      sorting: true
    });
  };

  handleSortMove = () => {
    const { toggleTrashIcon, renderDelete, id } = this.props;

    if (!renderDelete) toggleTrashIcon(id);
  };

  handleSortEnd = ({ oldIndex, newIndex }) => {
    const { swapStopsColors, id, colors, toggleTrashIcon, deleteStop } = this.props;
    const newColorOrder = arrayMove(colors, oldIndex, newIndex);
    this.props.updateActiveStop(null);
    if (!deleteStop) {
      swapStopsColors(id, newColorOrder);
    }

    toggleTrashIcon(null);
    this.setState({
      sorting: false
    });
  };

  handleEditInit = (pageX, stop) => {
    const { updateDraggedStopPos, updateUpdatingStop } = this.props;

    updateUpdatingStop(stop, pageX);
    updateDraggedStopPos(pageX);
  };

  handleSortItemClick = (e, stop, editing, sorting, pickingColorStop) => {
    if (e.type === 'mouseup' || e.type === 'touchend') {
      this.props.toggleEditing(null);

      if (!sorting && !this.props.passThreshold) {
        this.props.editStopColor(this.props.id, stop);
        this.props.updateActiveColorPicker(stop, pickingColorStop);
      }

      // if (e.type === 'touchend') {
      //   this.props.updateUpdatingStop(null)
      //   this.props.updateDraggedStopPos(null)
      // }
    } else if (e.type === 'mousedown' || e.type === 'touchstart') {
      e.preventDefault();
      this.props.updateActiveStop(stop);

      if (editing) {
        this.handleEditInit(e.nativeEvent.pageX, stop);
        // if (e.type === 'mousedown') {
        //   this.handleEditInit(e.nativeEvent.pageX, stop)
        // } else this.handleEditInit(e.nativeEvent.touches[0].pageX, stop)
      }
    }
    // todo: figure out why updateDraggedStopPos(pageX) wont work on touchmove
    // else if (e.type === 'touchmove') {
    //   const { pageX } = e.nativeEvent.touches[0]
    //   if (pageX >= 0) {
    //     updateDraggedStopPos(pageX)
    //   }
    // }
  };

  render() {
    const { stops, editing, updatingValue, colors, pickingColorStop, ...props } = this.props;
    const { sorting } = this.state;

    return (
      colors &&
      <SortableList
        transitionDuration={300}
        axis="x"
        useWindowAsScrollContainer
        lockAxis="x"
        onSortStart={this.handleSortStart}
        onSortMove={this.handleSortMove}
        onSortEnd={this.handleSortEnd}
        shouldCancelStart={() => editing || updatingValue !== null || pickingColorStop !== null}
        distance={5}
        lockToContainerEdges
        sorting={sorting}
        onSortItemClick={this.handleSortItemClick}
        editing={editing}
        pickingColorStop={pickingColorStop}
        helperClass="sortable-helper"
        stops={stops}
        updatingValue={updatingValue}
        {...props}
      />
    );
  }
}

const mapStateToProps = (state, props) => {
  const stops = getStopsById(state, props);
  const updatingValue = state.stops.updating.stop;
  const stopKeys = Object.keys(stops);
  const colors = Object.values(stops);
  const editing = getEditingState(state, props);
  const editingColor = state.stops.editingColor;
  return {
    stops,
    updatingValue,
    stopKeys,
    colors,
    editing,
    editingColor,
    editingAngle: state.gradients.editingAngle.id !== null,
    data: getStopData(state, props),
    pickingColorStop: state.stops.updating.pickingColorStop,
    passThreshold: state.stops.updating.passThreshold,
    active: state.stops.updating.active,
    renderDelete: state.icons.deleteStop === props.id && Object.keys(stops).length > 2
  };
};

export default connect(mapStateToProps, {
  editStopColor,
  swapStopsColors,
  updateDraggedStopPos,
  updateUpdatingStop,
  toggleEditing,
  updateActiveColorPicker,
  updateActiveStop,
  toggleTrashIcon
})(Swatch);
