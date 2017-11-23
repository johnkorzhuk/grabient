// @flow

import React from "react";
import styled from "styled-components";
import { Animate } from "react-move";

import { generateColorStopsFromData } from "./../../utils/gradient";

const Container = styled.div`
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 15px;
`;

const Gradient = ({
  stopData,
  transitionDuration,
  angle,
  opacity,
  hasOpacity,
  hovered,
  editingColor,
  editing
}: {
  stopData: StopData,
  transitionDuration: number,
  angle: number,
  opacity: number,
  hasOpacity: boolean,
  hovered: boolean,
  editingColor: boolean,
  editing: boolean
}) => {
  const newData = { ...stopData };
  if (hasOpacity) newData.opacity = hovered || editing ? opacity : 0;

  return (
    <Animate
      data={newData}
      duration={transitionDuration}
      ignore={editingColor ? Object.keys(newData) : []}
    >
      {data =>
        <Container
          style={{
            backgroundImage: `linear-gradient(${angle}deg, ${generateColorStopsFromData(
              data
            )})`,
            opacity: data.opacity
          }}
        />}
    </Animate>
  );
};

export default Gradient;
