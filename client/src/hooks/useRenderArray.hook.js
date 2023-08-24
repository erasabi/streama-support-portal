import { useState } from 'react'
import { isArray, isEmpty } from 'lodash'

const handleInvalidArray = () => {
	console.log('useArray value not valid array')
	return []
}

const useRenderArray = (defaultValue) => {
	const [array, setArray] = useState(defaultValue)
	const value = isArray(array) ? array : handleInvalidArray()
	const isNotEmpty = !isEmpty(value)

	return {
		value: value,
		setValue: setArray,
		clear: () => setArray([]),
		isNotEmpty
	}
}

export default useRenderArray
