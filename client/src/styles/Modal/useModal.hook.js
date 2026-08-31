import React from 'react'

export default () => {
	let [modal, setModal] = React.useState(false)
	let [modalContent, setModalContent] = React.useState()

	// Passing content opens (or replaces) the modal. Calling with no content
	// closes it. Previously this toggled, so swapping History → Details closed
	// the overlay instead of navigating.
	let handleModal = (content = false) => {
		if (content) {
			setModalContent(content)
			setModal(true)
			return
		}
		setModal(false)
	}

	return { modal, handleModal, modalContent }
}
