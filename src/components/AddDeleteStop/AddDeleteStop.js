import React from 'react';
import styled from 'styled-components';

import { ExpandEdit, Trash } from './../Icons/index';

const Container = styled.div`
  position: absolute;
  left: 0;
`;

const AddStopContainer = Container.extend`top: 10px;`;

const AddDeleteStop = ({ renderDelete, animationDuration, hovered, color, title }) => {
  if (renderDelete) {
    return <Trash title={title} color={color} inverted={hovered} animationDuration={animationDuration} />;
  } else {
    return <ExpandEdit color={color} hovered={hovered} />;
  }
};

export default AddDeleteStop;
