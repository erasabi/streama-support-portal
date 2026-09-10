/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import DryRunPanel from './DryRunPanel.component'

const backdropStyle = {
	alignItems: 'center',
	backgroundColor: 'rgba(0, 0, 0, 0.72)',
	bottom: 0,
	display: 'flex',
	justifyContent: 'center',
	left: 0,
	overflow: 'hidden',
	position: 'fixed',
	right: 0,
	top: 0,
	zIndex: 99999
}

const sheetStyle = {
	backgroundColor: '#222121',
	borderRadius: 16,
	boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
	display: 'flex',
	flexDirection: 'column',
	maxHeight: '90vh',
	minHeight: 0,
	overflow: 'hidden',
	padding: 20,
	width: 'min(92vw, 900px)'
}

/**
 * Independent overlay on document.body. Must not use ModalProvider — that
 * stack's document mousedown listener closes a just-opened dialog.
 */
export default function DryRunModal({
	open,
	onClose,
	user,
	getInput,
	heading,
	label = 'Dry Run'
}) {
	const overlayRef = useRef(null)
	const [closeArmed, setCloseArmed] = useState(false)

	useEffect(() => {
		if (!open) {
			setCloseArmed(false)
			return undefined
		}

		const arm = setTimeout(() => setCloseArmed(true), 400)

		function onKey(event) {
			if (event.key !== 'Escape') return
			event.preventDefault()
			event.stopPropagation()
			onClose()
		}

		document.addEventListener('keydown', onKey, true)
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			clearTimeout(arm)
			document.removeEventListener('keydown', onKey, true)
			document.body.style.overflow = previousOverflow
		}
	}, [open, onClose])

	if (!open || typeof document === 'undefined') return null

	return ReactDOM.createPortal(
		<div
			ref={overlayRef}
			data-dry-run-overlay="true"
			style={backdropStyle}
			role="presentation"
			onMouseDown={(event) => {
				event.stopPropagation()
				if (closeArmed && event.target === overlayRef.current) onClose()
			}}
		>
			<div
				style={sheetStyle}
				role="dialog"
				aria-modal="true"
				aria-labelledby="dry-run-title"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<DryRunPanel
					user={user}
					getInput={getInput}
					heading={heading}
					label={label}
					autoRun
					onClose={onClose}
				/>
			</div>
		</div>,
		document.body
	)
}
