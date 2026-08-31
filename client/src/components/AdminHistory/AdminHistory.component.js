/* eslint-disable react/prop-types */
import React, { useEffect, useState, useContext } from 'react'
import { useDispatch } from 'react-redux'
import styled from 'styled-components'
import { grey } from '@mui/material/colors'
import { Card, ModalContext } from '/src/styles'
import {
	getAdminHistory,
	getRequestEvents,
	deleteMediaRequest
} from '/src/api'
import { refreshRequestedMediaSoon } from '/src/redux'
import { UserContext } from '/src/hooks/userContext.hook'
import {
	statusColor,
	isHiddenFromComingSoon
} from '/src/utils/pipeline'
import MediaDetails from '/src/components/RequestedMediaList/components/MediaDetails.component'
import EventTimeline from '/src/components/EventTimeline'

export default function AdminHistory() {
	const { user = { username: 'Anonymous' } } = useContext(UserContext)
	const { handleModal } = useContext(ModalContext)
	const dispatch = useDispatch()
	const [rows, setRows] = useState([])
	const [expanded, setExpanded] = useState(null)
	const [events, setEvents] = useState([])
	const [filter, setFilter] = useState('')
	// "past" = no longer on the Coming Soon grid (archived or Available).
	// "active" = still on the grid.
	const [tab, setTab] = useState('past')

	async function load() {
		try {
			const data = await getAdminHistory({ pageSize: 200 }, user)
			setRows(data.requests || [])
		} catch (error) {
			console.log(error)
		}
	}

	useEffect(() => {
		load()
	}, [])

	const onExpand = async (id) => {
		if (expanded === id) {
			setExpanded(null)
			return
		}
		setExpanded(id)
		const evts = await getRequestEvents(id, user)
		setEvents(evts || [])
	}

	const reopenHistory = () => handleModal(<AdminHistory />)

	const onEdit = (row) => {
		handleModal(
			<MediaDetails
				{...row}
				onClosed={reopenHistory}
				handleRequestSubmit={() => {
					dispatch(refreshRequestedMediaSoon())
					load()
				}}
			/>
		)
	}

	const onDelete = async (row) => {
		if (!window.confirm(`Delete "${row.title}"? This archives the request.`)) {
			return
		}
		await deleteMediaRequest(row.id, () => dispatch(refreshRequestedMediaSoon()))
		await load()
	}

	const byTab = rows.filter((r) =>
		tab === 'past' ? isHiddenFromComingSoon(r) : !isHiddenFromComingSoon(r)
	)
	const visible = byTab.filter((r) => {
		if (!filter) return true
		const hay = `${r.title} ${r.requestUser} ${r.displayStatus} ${r.mediaType}`
		return hay.toLowerCase().includes(filter.toLowerCase())
	})

	const counts = {
		past: rows.filter((r) => isHiddenFromComingSoon(r)).length,
		active: rows.filter((r) => !isHiddenFromComingSoon(r)).length
	}

	return (
		<Wrapper>
			<Card className="card">
				<Card.Title className="card-title">Request History</Card.Title>
				<Tabs>
					<button
						className={tab === 'past' ? 'active' : ''}
						onClick={() => setTab('past')}
					>
						Past ({counts.past})
					</button>
					<button
						className={tab === 'active' ? 'active' : ''}
						onClick={() => setTab('active')}
					>
						On Portal ({counts.active})
					</button>
				</Tabs>
				<input
					className="filter"
					placeholder="Filter by title, user, status..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
				/>
				<div className="table-scroll">
				<Table>
					<thead>
						<tr>
							<th>Title</th>
							<th>Type</th>
							<th>Status</th>
							<th>Requested By</th>
							<th>Updated</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{visible.map((r) => (
							<React.Fragment key={r.id}>
								<tr className="row">
									<td onClick={() => onExpand(r.id)}>{r.title}</td>
									<td onClick={() => onExpand(r.id)}>{r.mediaType}</td>
									<td onClick={() => onExpand(r.id)}>
										<span
											className="badge"
											style={{ backgroundColor: statusColor(r.displayStatus) }}
										>
											{r.displayStatus}
										</span>
									</td>
									<td onClick={() => onExpand(r.id)}>{r.requestUser}</td>
									<td onClick={() => onExpand(r.id)}>
										{new Date(r.updatedAt).toLocaleDateString()}
									</td>
									<td className="actions">
										<button className="edit" onClick={() => onEdit(r)}>
											Edit
										</button>
										<button className="del" onClick={() => onDelete(r)}>
											Delete
										</button>
									</td>
								</tr>
								{expanded === r.id && (
									<tr>
										<td colSpan={6}>
											<EventTimeline events={events} />
										</td>
									</tr>
								)}
							</React.Fragment>
						))}
						{visible.length === 0 && (
							<tr>
								<td colSpan={6} className="empty">
									No requests in this view.
								</td>
							</tr>
						)}
					</tbody>
				</Table>
				</div>
			</Card>
		</Wrapper>
	)
}

const Wrapper = styled.div`
	display: flex;
	flex-direction: column;
	max-height: 100%;
	max-width: 90vw;
	min-height: 0;
	min-width: 320px;
	overflow: hidden;

	.card {
		display: flex;
		flex-direction: column;
		gap: 15px;
		max-height: 100%;
		min-height: 0;
		overflow: hidden;
		padding: 20px;
	}

	.filter,
	.card-title {
		flex-shrink: 0;
	}

	.table-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}
	.card-title {
		text-align: center;
	}
	.filter {
		background: ${grey[800]};
		border: 1px solid ${grey[700]};
		border-radius: 4px;
		color: white;
		padding: 8px;
	}
`

const Tabs = styled.div`
	display: flex;
	flex-shrink: 0;
	gap: 8px;

	button {
		background: ${grey[900]};
		border: 1px solid ${grey[700]};
		border-radius: 6px;
		color: ${grey[400]};
		cursor: pointer;
		font-size: 14px;
		padding: 8px 16px;

		&.active {
			background: #1f6fd6;
			border-color: #1f6fd6;
			color: white;
		}
	}
`

const Table = styled.table`
	border-collapse: collapse;
	color: white;
	font-size: 13px;
	width: 100%;

	th,
	td {
		border-bottom: 1px solid ${grey[800]};
		padding: 6px 8px;
		text-align: left;
	}
	.row td:not(.actions) {
		cursor: pointer;
	}
	.row:hover {
		background: ${grey[900]};
	}
	.badge {
		border-radius: 10px;
		color: white;
		padding: 2px 8px;
		white-space: nowrap;
	}
	.empty {
		color: ${grey[500]};
		text-align: center;
		padding: 20px;
	}
	.actions {
		display: flex;
		gap: 6px;
		white-space: nowrap;
	}
	.actions button {
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		font-size: 12px;
		padding: 4px 10px;
	}
	.actions .edit {
		background: #1f6fd6;
	}
	.actions .del {
		background: #b90000;
	}
`
