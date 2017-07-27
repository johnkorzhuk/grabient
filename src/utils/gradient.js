function generateLinProperties(values, fallback) {
  const gradientProps = [];
  if (fallback) gradientProps.push(`background-color: ${fallback};\n`);
  values.forEach(propValue => {
    gradientProps.push(`background-image: ${propValue}\n`);
  });
  return gradientProps;
}

function generateLinData(stops) {
  const stopKeys = Object.keys(stops);
  return stopKeys.map(stop => ` ${stops[stop]} ${stop}%`).join().trim();
}

function generateLinValue(angle, linData) {
  return `linear-gradient(${angle}deg, ${linData});`;
}

function prefix(value, prefixed) {
  if (!prefixed) return [value];

  const prefixes = ['-webkit-', '-moz-', '-o-'];
  const prefixedValues = prefixes.map(pref => `${pref}${value}`);
  prefixedValues.push(value);
  return prefixedValues;
}

export function generateColorStopsFromData(data) {
  const newData = { ...data };
  const gradientStops = [];
  delete newData.opacity;
  const dataKeys = Object.keys(newData);

  dataKeys.forEach((stop, index) => {
    gradientStops.push(newData[stop]);
    gradientStops.push(index === dataKeys.length - 1 ? `${stop}%` : `${stop}%,`);
  });

  return gradientStops.join(' ');
}

export function generateLinearGradient(angle, stopData, prefixed = false, fallback = false) {
  return generateLinProperties(
    prefix(generateLinValue(angle, generateLinData(stopData)), prefixed),
    fallback ? stopData[Object.keys(stopData)[0]] : false
  ).join('');
}
