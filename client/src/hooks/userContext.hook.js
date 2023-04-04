/* eslint-disable react/prop-types */
import React, { useEffect, useState } from 'react'
import { getUser } from '/src/api'
const defaultUser = { user: {} }
const UserContext = React.createContext()

const UserProvider = ({ children }) => {
	const [user, setUser] = useState()

	// On Mount: fetch & display already requested media
	useEffect(() => {
		async function fetch() {
			const currUser = await getUser()
			setUser(currUser)
		}
		fetch()
	}, [])

	return (
		<UserContext.Provider value={user ?? defaultUser}>
			{children}
		</UserContext.Provider>
	)
}

export { UserContext, UserProvider }
