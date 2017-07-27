// @flow
import type { Children } from 'react';

import React from 'react';
import styled from 'styled-components';

export const GradientDisplayContainer = styled.div`
  max-width: 1100px;
  margin: 15px auto 0;

  @media (min-width: 820px) {
    margin-left: 40px;
    margin-right: 40px;
  }

  @media (min-width: 970px) {
    margin-left: auto;
    margin-right: auto;
  }
`;

const GradientDisplay = ({ children }: { children: Children }) =>
  <GradientDisplayContainer>
    {children}
  </GradientDisplayContainer>;

export default GradientDisplay;
