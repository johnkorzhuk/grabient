export const loadState = () => {
  try {
    const serializedState = localStorage.getItem('grabientSettings');
    if (serializedState === null) return undefined;
    return JSON.parse(serializedState);
  } catch (e) {
    return undefined;
  }
};

export const saveState = state => {
  try {
    const serializedState = JSON.stringify({
      settings: {
        ...state
      }
    });
    localStorage.setItem('grabientSettings', serializedState);
  } catch (e) {
    console.error('failed to save to local storage');
  }
};
