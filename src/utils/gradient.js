export { generateColorStopsFromData, generateLinearGradient }

function generateColorStopsFromData (data) {
  let newData = { ...data }
  let gradientStops = []
  delete newData.opacity
  const dataKeys = Object.keys(newData)

  dataKeys.forEach((stop, index) => {
    gradientStops.push(newData[stop])
    gradientStops.push(index === dataKeys.length - 1 ? `${stop}%` : `${stop}%,`)
  })

  return gradientStops.join(' ')
}

function generateLinearGradient (
  angle,
  stopData,
  prefixed = true,
  fallback = true
) {
  return generateLinProperties(
    prefix(generateLinValue(angle, generateLinData(stopData)), prefixed),
    fallback ? stopData[Object.keys(stopData)[0]] : false
  ).join('')
}

function generateLinData (stops) {
  const stopKeys = Object.keys(stops)
  return stopKeys.map(stop => ` ${stops[stop]} ${stop}%`).join().trim()
}

function generateLinValue (angle, linData) {
  return `linear-gradient(${angle}deg, ${linData});`
}

function prefix (value, prefixed) {
  if (!prefixed) return [value]
  else {
    const prefixes = ['-webkit-', '-moz-', '-o-']
    let prefixedValues = prefixes.map(prefix => `${prefix}${value}`)
    prefixedValues.push(value)
    return prefixedValues
  }
}

function generateLinProperties (values, fallback) {
  let gradientProps = []
  if (fallback) gradientProps.push(`background-color: ${fallback};\n`)
  values.forEach(propValue => {
    gradientProps.push(`background-image: ${propValue}\n`)
  })
  return gradientProps
}
