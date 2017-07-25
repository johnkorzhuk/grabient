import React from 'react';
import styled from 'styled-components';
import { Logo } from './../Common/index';

const GradientDisplayContainer = styled.section`
  max-width: 1100px;
  margin: 25px auto;
  padding: 0 20px;
  text-align: center;
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 620px) {
    flex-direction: column;
  }
`;

const LogoContainer = styled.h1`@media (max-width: 550px) {margin-bottom: 10px;}`;

const Hero = () => {
  return (
    <GradientDisplayContainer>
      <LogoContainer>
        <Logo />
      </LogoContainer>
      <div>
        <iframe
          title="github"
          src="https://ghbtns.com/github-btn.html?user=johnkorzhuk&repo=grabient&type=star&count=true"
          frameBorder="0"
          scrolling="0"
          width="91px"
          height="20px"
        />

        <iframe
          title="facebook"
          src="https://www.facebook.com/plugins/share_button.php?href=http%3A%2F%2Fgrabient.com%2F&layout=button_count&size=small&mobile_iframe=true&width=69&height=20&appId"
          width="80"
          height="20"
          scrolling="no"
          frameBorder="0"
          allowTransparency="true"
        />

        <iframe
          src="https://platform.twitter.com/widgets/tweet_button.html?size=s&url=https%3A%2F%2Fwww.grabient.com&via=unfoldco&related=twitterapi%2Ctwitter&text=Grab%20and%20customize%20yourself%20a%20web%20gradient!%20%23css%20%23gradients%20%23webdesign%20%23webdevelopment"
          width="61px"
          height="20px"
          scrolling="no"
          frameBorder="0"
          title="Twitter Tweet Button"
          style={{
            bordeR: 'none',
            overflow: 'hidden',
            marginLeft: 7
          }}
        />
      </div>
    </GradientDisplayContainer>
  );
};

export default Hero;
