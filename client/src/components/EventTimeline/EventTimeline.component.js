/* eslint-disable react/prop-types */
import React from 'react'
import styled from 'styled-components'
import { grey } from '@mui/material/colors'
import { eventDetail, eventLabel, prepareEvents } from '/src/utils/pipeline'

function relativeTime(iso) {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return ''
	const diffMs = Date.now() - date.getTime()
	const abs = Math.abs(diffMs)
	const mins = Math.round(abs / 60000)
	if (mins < 1) return 'just now'
	if (mins < 60) return `${mins}m ago`
	const hours = Math.round(mins / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.round(hours / 24)
	if (days < 14) return `${days}d ago`
	return date.toLocaleDateString()
}

export default function EventTimeline({ events = [] }) {
	const rows = prepareEvents(events)
	if (!rows.length) {
		return (
			<Timeline>
				<li className="empty">No events</li>
			</Timeline>
		)
	}
	return (
		<Timeline>
			{rows.map((evt) => {
				const detail = eventDetail(evt)
				return (
					<li key={evt.id}>
						<div className="evt-main">
							<span className="evt-type">{evt.displayLabel || eventLabel(evt)}</span>
							{detail && <span className="evt-detail">{detail}</span>}
						</div>
						<span className={`evt-actor actor-${evt.actor || 'portal'}`}>
							{evt.actor || 'portal'}
						</span>
						<span className="evt-time" title={new Date(evt.createdAt).toLocaleString()}>
							{relativeTime(evt.createdAt)}
						</span>
					</li>
				)
			})}
		</Timeline>
	)
}

const Timeline = styled.ul`
	background: #1b1a1a;
	border: 1px solid ${grey[800]};
	border-radius: 8px;
	list-style: none;
	margin: 0;
	max-height: 240px;
	overflow-y: auto;
	padding: 6px 10px;
	width: 100%;

	li {
		align-items: center;
		border-bottom: 1px solid ${grey[900]};
		color: white;
		display: flex;
		flex-wrap: wrap;
		font-size: 12px;
		gap: 8px;
		padding: 8px 0;
	}
	.evt-main {
		display: flex;
		flex: 1 1 160px;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.evt-detail {
		color: ${grey[500]};
		font-size: 11px;
		font-weight: 400;
		word-break: break-word;
	}
	li:last-child {
		border-bottom: none;
	}
	.empty {
		color: ${grey[500]};
		justify-content: center;
	}
	.evt-type {
		font-weight: 600;
	}
	.evt-actor {
		border-radius: 10px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.3px;
		padding: 2px 8px;
		text-transform: uppercase;
	}
	.actor-user {
		background: #1f6fd633;
		color: #8ec0ff;
	}
	.actor-admin {
		background: #c76a0033;
		color: #ffc07a;
	}
	.actor-portal {
		background: ${grey[800]};
		color: ${grey[300]};
	}
	.actor-pipeline {
		background: #1f6fd633;
		color: #7eb6ff;
	}
	.actor-sortify {
		background: #0ea10033;
		color: #8ee08e;
	}
	.evt-time {
		color: ${grey[500]};
		margin-left: auto;
		white-space: nowrap;
	}
	::-webkit-scrollbar {
		width: 8px;
	}
	::-webkit-scrollbar-thumb {
		background: ${grey[700]};
		border-radius: 4px;
	}
`
