export { generateColorStopsFromData }

function generateColorStopsFromData (data, prefixed = false, inverse = false) {
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
