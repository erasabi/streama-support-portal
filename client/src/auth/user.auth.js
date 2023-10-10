/* eslint-disable react/prop-types */
import { useContext } from 'react'
import { UserContext } from '/src/hooks/userContext.hook'
import { ADMIN_SECRETS, SUPERUSER_SECRETS } from '/src/constants'

export function isAdmin() {
	try {
		const { user } = useContext(UserContext)
		if (process.env.NODE_ENV === 'development') return true
		return (
			user.authorities?.filter((e) => e.displayName === ADMIN_SECRETS).length >
			0
		)
	} catch (error) {
		console.log(error)
		return false
	}
}

export function isSuperuser() {
	try {
		const { user } = useContext(UserContext)
		if (process.env.NODE_ENV === 'development') return true
		return user.username === SUPERUSER_SECRETS
	} catch (error) {
		console.log(error)
		return false
	}
}

export function matchesUser(username) {
	try {
		const { user = { username: 'Anonymous' } } = useContext(UserContext)
		return user.username === username
	} catch (error) {
		console.log(error)
		return false
	}
}
