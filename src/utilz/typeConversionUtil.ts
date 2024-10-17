export const arrayToObject = (arr: Array<[string, any]>): Record<string, any> => {
  const result: Record<string, any> = {}

  arr.forEach(([key, value]) => {
    result[key] = value
  })

  return result
}

export const arrayToMap = (arr: Array<[string, any]>): Map<string, any> => {
  const result = new Map<string, any>()

  arr.forEach(([key, value]) => {
    result.set(key, value)
  })

  return result
}
