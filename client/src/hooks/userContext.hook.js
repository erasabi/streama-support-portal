/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react'
import { getUser } from '/src/api'

const UserContext = React.createContext()

const UserProvider = ({ children }) => {
	const [user, setUser] = useState({ user: {} })

	// On Mount: fetch & display already requested media
	useEffect(() => {
		async function getCurrUser() {
			setUser(await getUser())
		}
		getCurrUser()
	}, [])

	return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export { UserContext, UserProvider }
