/* eslint-disable react/prop-types */
import React, { useMemo } from 'react'
import { useQuery } from 'react-query'
import { getUser } from '../api'
const UserContext = React.createContext()

// Stable identity for signed-out visitors. Consumers must never receive a fresh
// user object on every render: that churns `useCallback`/`useEffect` deps (e.g.
// the media-details fetch effect) into tight re-render loops that lock up the UI
// on touch browsers. Always hand down a referentially stable `user`.
const ANONYMOUS_USER = { username: 'Anonymous' }

const UserProvider = ({ children }) => {
	const { data } = useQuery('user', getUser)
	const value = useMemo(() => ({ user: data ?? ANONYMOUS_USER }), [data])

	return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export { UserContext, UserProvider }
