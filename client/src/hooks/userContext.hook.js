/* eslint-disable react/prop-types */
import React from 'react'
import { useQuery } from 'react-query'
import { getUser } from '../api'
const UserContext = React.createContext()

const UserProvider = ({ children }) => {
	const { data, isError } = useQuery('user', getUser)
	console.log(isError)
	return (
		<UserContext.Provider value={{ user: data }}>
			{children}
		</UserContext.Provider>
	)
}

export { UserContext, UserProvider }
