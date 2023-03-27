import React from 'react'
import useModal from './useModal.hook'
import Modal from './Modal.component'
import { ModalContext } from './Modal.context'

const ModalProvider = ({ children }) => {
	let { modal, handleModal, modalContent } = useModal()
	return (
		<ModalContext.Provider value={{ modal, handleModal, modalContent }}>
			<Modal />
			{children}
		</ModalContext.Provider>
	)
}

export default ModalProvider
