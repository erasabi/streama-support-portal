import React, { useEffect, useRef, useContext } from 'react'
import ReactDOM from 'react-dom'
import { ModalContext } from './Modal.context'
import styled from 'styled-components'

const Modal = () => {
	let { modalContent, handleModal, modal } = useContext(ModalContext)
	const modalRef = useRef()

	useEffect(() => {
		// check that the modal is actually open before event listener setup
		if (!modal) return

		// this ensures we dont double toggle by clicking document where
		// referenced element with onClick is located
		function handleClickOutside(event) {
			if (modalRef.current && !modalRef.current.contains(event.target)) {
				handleModal()
			}
		}

		// if anywhere on document is clicked run function
		document.addEventListener('mousedown', handleClickOutside)
		// clean up event listener on useEffect completion
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [modal])

	return modal
		? ReactDOM.createPortal(
				<Backdrop>
					<Container ref={modalRef}>{modalContent}</Container>
				</Backdrop>,
				document.querySelector('#modal-root')
		  )
		: null
}

export default Modal

const Backdrop = styled.div`
	align-items: center;
	background-color: #00000082;
	display: flex;
	height: 100vh;
	width: 100vw;
	justify-content: center;
	position: fixed;
	top: 0;
	z-index: 1000;
`
const Container = styled.div`
	align-items: center;
	background-color: #222121;
	border-radius: 25px;
	padding: 25px;
	width: 75vw;
`
