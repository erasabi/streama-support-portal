/* eslint-disable react/prop-types */
import React from 'react'
import { useQuery } from 'react-query'
import { getUser } from '../api'
const UserContext = React.createContext()

const UserProvider = ({ children }) => {
	// eslint-disable-next-line no-unused-vars
	const { data, isError } = useQuery('user', getUser)

	return (
		<UserContext.Provider value={{ user: data }}>
			{children}
		</UserContext.Provider>
	)
}

export { UserContext, UserProvider }
