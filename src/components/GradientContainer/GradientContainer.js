import React from 'react';
import styled from 'styled-components';
import { Animate } from 'react-move';

import Gradient from './../Gradient/Gradient';
import { AngleWheel } from './../../containers/index';
import { Button } from './../Common/index';
import { Copy, Reset } from './../Icons/index';
import { TextXS } from './../Common/Typography';

const GRADIENT_HEIGHT = 300;
const COPY_RESET_ANIMATION_DURATION = 300;

const Container = styled.div`
  position: relative;
  height: ${GRADIENT_HEIGHT}px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const NoBlur = styled.div`
  height: 100%;
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 15px;
`;

const Blurred = styled.div`
  filter: blur(20px);
  height: 100%;
  width: 100%;
  border-radius: 15px;
  margin-top: -${GRADIENT_HEIGHT}px;
`;

const GradientButton = Button.extend`
  z-index: 20;
  position: absolute;
  padding: 3px;
  border-radius: 3px;
  display: flex;
`;

const ButtonText = TextXS.extend`
  color: white;
  ${({ left }) => (left ? 'padding-left: 5px;' : 'padding-right: 5px;')} text-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  text-transform: uppercase;
  padding-top: 6px;
`;

const ButtonTextContainer = ({ left = false, text, hovered }) =>
  <Animate
    duration={COPY_RESET_ANIMATION_DURATION}
    data={{
      opacity: hovered ? 1 : 1
    }}
  >
    {data =>
      <ButtonText
        left={left}
        style={{
          opacity: data.opacity
        }}
      >
        {text}
      </ButtonText>}
  </Animate>;

const GradientContainer = ({
  gradientAnimationDuration,
  wheelAnimationDuration,
  id,
  actualAngle,
  hovered,
  onMouseEnter,
  onMouseLeave,
  editingAngle,
  editingStop,
  editingColor,
  stopData,
  pickingColorStop,
  copiedId,
  onCopyCSS,
  edited,
  resetGradientAngle,
  resetColorStop,
  copyHovered,
  resetHovered
}) => {
  const editing = editingAngle || editingStop || editingColor;
  const renderButton = hovered && !editingAngle;
  const text = copiedId === id ? 'copied' : 'copy css';
  const zIndex = pickingColorStop ? 4 : 9;
  return (
    <Container>
      {renderButton &&
        <GradientButton
          style={{
            top: 15,
            left: 15
          }}
          title="Copy CSS"
          onClick={() => {
            if (!copiedId || id !== copiedId) {
              onCopyCSS(actualAngle, stopData, id);
            }
          }}
          onMouseEnter={e => onMouseEnter(e, ['main', 'copy'])}
          onMouseLeave={e => onMouseLeave(e, ['main', 'copy'])}
        >
          <Copy color={'white'} hovered={copyHovered} animationDuration={COPY_RESET_ANIMATION_DURATION} />
          <ButtonTextContainer left text={copyHovered ? text : ' '} hovered={copyHovered} />
        </GradientButton>}
      {renderButton &&
        edited &&
        <GradientButton
          style={{
            top: 15,
            right: 15
          }}
          title="Reset"
          onClick={() => {
            resetGradientAngle(id);
            resetColorStop(id);
          }}
          onMouseEnter={e => onMouseEnter(e, ['main', 'reset'])}
          onMouseLeave={e => onMouseLeave(e, ['main', 'reset'])}
        >
          <ButtonTextContainer text={resetHovered ? 'Reset' : ' '} hovered={resetHovered} />

          <Reset color="white" hovered={resetHovered} animationDuration={COPY_RESET_ANIMATION_DURATION} />
        </GradientButton>}

      <div
        onMouseEnter={e => onMouseEnter(e, ['main'])}
        onMouseLeave={e => onMouseLeave(e, ['main'])}
        style={{
          height: '100%',
          width: '100%'
        }}
      >
        <NoBlur
          style={{
            zIndex: hovered ? zIndex : 'auto'
          }}
        >
          <Gradient
            editingColor={editingColor}
            stopData={stopData}
            angle={actualAngle}
            transitionDuration={gradientAnimationDuration}
          />
        </NoBlur>

        <Blurred>
          <Gradient
            editingColor={editingColor}
            stopData={stopData}
            hasOpacity
            editing={editing}
            hovered={hovered}
            opacity={0.8}
            angle={actualAngle}
            transitionDuration={gradientAnimationDuration}
          />
        </Blurred>
      </div>

      <AngleWheel
        onMouseEnter={e => onMouseEnter(e, ['main'])}
        onMouseLeave={e => onMouseLeave(e, ['main'])}
        angle={actualAngle}
        id={id}
        transitionDuration={wheelAnimationDuration}
      />
    </Container>
  );
};

export default GradientContainer;
