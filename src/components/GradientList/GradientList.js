import React from "react";
import styled from "styled-components";
import roraAd from "../../assets/rora-grabient@2x.png";
import { GradientCard } from "./../../containers/index";

const Container = styled.ul`
  display: flex;
  justify-content: center;
  flex-wrap: wrap;

  @media (min-width: 680px) {
    justify-content: flex-start;
  }
`;

const RoraAd = styled.img`
  padding: 20px;
  width: 100%;
`;

const GradientList = ({ gradients }) => (
  <div>
    <a href="https://rora.co/">
      <RoraAd src={roraAd} alt="rora ad" />
    </a>
    <Container>
      {gradients.map((item, index) => (
        <GradientCard
          key={item.id}
          gradient={item}
          index={index}
          width="100%"
          id={item.id}
        />
      ))}
    </Container>
  </div>
);

export default GradientList;
