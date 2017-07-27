import React from 'react';

import { ExpandEdit, Trash } from './../Icons/index';

const AddDeleteStop = ({ renderDelete, animationDuration, hovered, color, title }) => {
  if (renderDelete) {
    return <Trash title={title} color={color} inverted={hovered} animationDuration={animationDuration} />;
  }
  return <ExpandEdit color={color} hovered={hovered} />;
};

export default AddDeleteStop;
