import React from 'react';
import CheckIcon from 'react-icons/lib/md/check';

const Copy = ({ color, size = 15, ...props }) => <CheckIcon color={color} size={size} {...props} />;

export default Copy;
