import React, { useEffect, useRef, useContext, useState } from 'react'
import ReactDOM from 'react-dom'
import { ModalContext } from './Modal.context'
import styled from 'styled-components'

const Modal = () => {
	let { modalContent, handleModal, modal } = useContext(ModalContext)
	const backdropRef = useRef(null)
	const modalRef = useRef()
	const [closeArmed, setCloseArmed] = useState(false)

	useEffect(() => {
		if (!modal) {
			setCloseArmed(false)
			return undefined
		}

		const arm = setTimeout(() => setCloseArmed(true), 350)

		function handleEscape(event) {
			if (event.key === 'Escape') {
				handleModal()
			}
		}

		document.addEventListener('keydown', handleEscape)
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'

		return () => {
			clearTimeout(arm)
			document.removeEventListener('keydown', handleEscape)
			document.body.style.overflow = previousOverflow
		}
	}, [modal, handleModal])

	const dismissFromBackdrop = (event) => {
		if (!closeArmed) return
		if (
			event.target &&
			event.target.closest &&
			event.target.closest('[data-dry-run-overlay]')
		) {
			return
		}
		if (event.target !== backdropRef.current) return
		event.preventDefault()
		handleModal()
	}

	return modal
		? ReactDOM.createPortal(
				<Backdrop
					ref={backdropRef}
					role="presentation"
					onPointerDown={dismissFromBackdrop}
				>
					<Container
						ref={modalRef}
						role="dialog"
						aria-modal="true"
						onPointerDown={(event) => event.stopPropagation()}
					>
						{modalContent}
					</Container>
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
	height: 100%;
	inset: 0;
	justify-content: center;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: max(12px, env(safe-area-inset-top, 0px)) 12px
		max(12px, env(safe-area-inset-bottom, 0px));
	position: fixed;
	touch-action: manipulation;
	width: 100%;
	z-index: 1000;
	-webkit-overflow-scrolling: touch;

	@media only screen and (max-width: 599px) {
		align-items: flex-start;
	}
`
const Container = styled.div`
	align-items: stretch;
	background-color: #222121;
	border-radius: 25px;
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	height: min(90dvh, 90vh);
	max-height: min(90dvh, 90vh);
	min-height: 0;
	overflow: hidden;
	padding: 20px;
	width: min(92vw, 900px);

	@media only screen and (min-width: 600px) {
		padding: 25px;
	}

	@media only screen and (max-width: 599px) {
		height: min(
			calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)),
			92dvh,
			92vh
		);
		max-height: min(
			calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)),
			92dvh,
			92vh
		);
	}

	> * {
		min-height: 0;
	}
`
