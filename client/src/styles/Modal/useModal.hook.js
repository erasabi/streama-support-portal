import React, { useCallback, useRef } from 'react'

/** Ignore opens briefly after close so the same tap does not hit the grid below. */
const SUPPRESS_OPEN_MS = 450

export default () => {
	const [modal, setModal] = React.useState(false)
	const [modalContent, setModalContent] = React.useState()
	const suppressOpenUntilRef = useRef(0)

	const handleModal = useCallback((content = false) => {
		// Passing content opens (or replaces) the modal. Calling with no content
		// closes it. Previously this toggled, so swapping History → Details closed
		// the overlay instead of navigating.
		if (content) {
			if (Date.now() < suppressOpenUntilRef.current) return
			setModalContent(content)
			setModal(true)
			return
		}
		suppressOpenUntilRef.current = Date.now() + SUPPRESS_OPEN_MS
		setModal(false)
	}, [])

	return { modal, handleModal, modalContent }
}
