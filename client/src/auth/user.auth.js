/* eslint-disable react/prop-types */
import { ADMIN_SECRETS, SUPERUSER_SECRETS } from '/src/constants'

export function isAdmin(user) {
	try {
		if (process.env.NODE_ENV !== 'production') return true
		return (
			user.authorities?.filter((e) => e.displayName === ADMIN_SECRETS).length >
			0
		)
	} catch (error) {
		console.log(error)
		return false
	}
}

export function isSuperuser(user) {
	try {
		if (process.env.NODE_ENV !== 'production') return true
		return user.username === SUPERUSER_SECRETS
	} catch (error) {
		console.log(error)
		return false
	}
}

export function matchesUser(user, requestUser) {
	try {
		return user.username === requestUser
	} catch (error) {
		console.log(error)
		return false
	}
}
